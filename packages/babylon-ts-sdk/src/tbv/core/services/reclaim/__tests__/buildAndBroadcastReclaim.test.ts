/**
 * Reclaim orchestration tests.
 *
 * The PSBT builder and its binds have their own suite; here the contract under
 * test is the orchestration — fee caps, call order, per-input signature
 * verification, and abort handling.
 */

import type { Address, Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  RECLAIM_MAX_FEE_FRACTION_DENOMINATOR,
  RECLAIM_MAX_FEE_FRACTION_NUMERATOR,
  RECLAIM_MAX_FEE_RATE_SATS_VB,
  ReclaimUneconomicalError,
  buildAndBroadcastReclaim,
  type ReclaimVaultData,
} from "../index";

vi.mock("../../../primitives/psbt/reclaim", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../primitives/psbt/reclaim")>();
  return {
    ...actual,
    buildReclaimPsbt: vi.fn().mockReturnValue({
      psbtHex: "70736274ffmock",
      outputValue: 32_355n,
      totalInputValue: 33_000n,
    }),
  };
});

vi.mock("../../../primitives/psbt/assertPsbtUnsignedTxMatches", () => ({
  assertPsbtUnsignedTxMatches: vi.fn(),
}));

vi.mock("../../../primitives/psbt/payout", () => ({
  extractPayoutSignature: vi.fn().mockReturnValue("aa".repeat(64)),
}));

vi.mock("../../../primitives/psbt/verifyScriptPathSchnorrSignature", () => ({
  assertScriptPathSchnorrSignature: vi.fn(),
}));

vi.mock(
  "../../../primitives/psbt/finalizeScriptPathWithSignatures",
  () => ({
    finalizeScriptPathWithSignatures: vi.fn().mockReturnValue("signedtxhex"),
  }),
);

vi.mock("../../../utils/transaction/btcTxHash", () => ({
  calculateBtcTxHash: vi.fn().mockReturnValue(`0x${"cd".repeat(32)}`),
}));

// The vault-id bind hashes the PegIn back to the id that was requested. The
// derivation itself is golden-vector tested against the Rust reference in
// `primitives/__tests__/deriveVaultId.test.ts`; here it is stubbed at the lazy
// WASM boundary the service imports so the tests can drive agreement and
// disagreement directly.
vi.mock("../../../wasm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../wasm")>();
  return {
    ...actual,
    deriveVaultId: vi.fn().mockResolvedValue(`0x${"11".repeat(32)}`),
  };
});

const { buildReclaimPsbt } = await import("../../../primitives/psbt/reclaim");
const { finalizeScriptPathWithSignatures } = await import(
  "../../../primitives/psbt/finalizeScriptPathWithSignatures"
);
const { deriveVaultId } = await import("../../../wasm");
const { assertScriptPathSchnorrSignature } = await import(
  "../../../primitives/psbt/verifyScriptPathSchnorrSignature"
);
const { extractPayoutSignature } = await import(
  "../../../primitives/psbt/payout"
);

const VAULT_ID = `0x${"11".repeat(32)}` as Hex;
const SECOND_VAULT_ID = `0x${"22".repeat(32)}` as Hex;
const DEPOSITOR_ETH_ADDRESS = `0x${"33".repeat(20)}` as Address;
const DEPOSITOR_PUBKEY =
  "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const PEGIN_TXID = "cd".repeat(32);
const CLAIM_VALUE = 33_000n;

function makeVaultData(
  overrides: Partial<ReclaimVaultData> = {},
): ReclaimVaultData {
  return {
    depositorSignedPeginTxHex: "0200000000",
    observed: {
      txid: PEGIN_TXID,
      vout: 1,
      scriptPubKey: "5120" + "ab".repeat(32),
      value: CLAIM_VALUE,
    },
    expectedClaimValue: CLAIM_VALUE,
    ...overrides,
  };
}

function makeInput(overrides: Record<string, unknown> = {}) {
  return {
    vaultIds: [VAULT_ID],
    depositorEthAddress: DEPOSITOR_ETH_ADDRESS,
    depositorBtcPubkey: DEPOSITOR_PUBKEY,
    readVaults: vi.fn().mockResolvedValue([makeVaultData()]),
    feeRate: 5,
    signPsbt: vi.fn().mockResolvedValue("70736274ffsigned"),
    broadcastTx: vi.fn().mockResolvedValue({ txId: "abc123" }),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buildAndBroadcastReclaim", () => {
  it("returns the broadcast result on the happy path", async () => {
    const input = makeInput();

    await expect(buildAndBroadcastReclaim(input)).resolves.toEqual({
      txId: "abc123",
    });
    expect(input.broadcastTx).toHaveBeenCalledWith("signedtxhex");
  });

  it("sizes the fee from the rate and the input count", async () => {
    await buildAndBroadcastReclaim(makeInput({ feeRate: 5 }));

    // 129 vB at 5 sat/vB.
    expect(vi.mocked(buildReclaimPsbt).mock.calls[0][0].feeSats).toBe(645n);
  });

  it("rejects a fee rate above the safety cap before reading any vault", async () => {
    const input = makeInput({ feeRate: RECLAIM_MAX_FEE_RATE_SATS_VB + 1 });

    await expect(buildAndBroadcastReclaim(input)).rejects.toBeInstanceOf(
      ReclaimUneconomicalError,
    );
    // Fails closed ahead of any I/O — no wallet prompt, no chain read.
    expect(input.readVaults).not.toHaveBeenCalled();
    expect(input.signPsbt).not.toHaveBeenCalled();
  });

  it("rejects a fee above the fraction cap of the swept total", async () => {
    // The cap is 25% of 33,000 = 8,250 sats. At 129 vB that binds around
    // 64 sat/vB, so 100 sat/vB is comfortably over.
    const input = makeInput({ feeRate: 100 });

    await expect(buildAndBroadcastReclaim(input)).rejects.toBeInstanceOf(
      ReclaimUneconomicalError,
    );
    expect(input.signPsbt).not.toHaveBeenCalled();
  });

  it("allows a fee just under the fraction cap", async () => {
    const capSats =
      (CLAIM_VALUE * RECLAIM_MAX_FEE_FRACTION_NUMERATOR) /
      RECLAIM_MAX_FEE_FRACTION_DENOMINATOR;
    // Highest whole sat/vB whose 129 vB fee stays at or under the cap.
    const feeRate = Math.floor(Number(capSats) / 129);

    await expect(
      buildAndBroadcastReclaim(makeInput({ feeRate })),
    ).resolves.toEqual({ txId: "abc123" });
  });

  it("reports the fee and swept total on an uneconomical rejection", async () => {
    try {
      await buildAndBroadcastReclaim(makeInput({ feeRate: 100 }));
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ReclaimUneconomicalError);
      const typed = error as ReclaimUneconomicalError;
      expect(typed.sweptTotalSats).toBe(CLAIM_VALUE);
      expect(typed.feeSats).toBe(12_900n);
    }
  });

  it("verifies a signature for every input, not just the first", async () => {
    const input = makeInput({
      vaultIds: [VAULT_ID, SECOND_VAULT_ID],
      readVaults: vi
        .fn()
        .mockResolvedValue([makeVaultData(), makeVaultData()]),
    });
    vi.mocked(deriveVaultId)
      .mockResolvedValueOnce(VAULT_ID)
      .mockResolvedValueOnce(SECOND_VAULT_ID);

    await buildAndBroadcastReclaim(input);

    expect(vi.mocked(extractPayoutSignature).mock.calls.map((c) => c[2])).toEqual(
      [0, 1],
    );
    expect(
      vi
        .mocked(assertScriptPathSchnorrSignature)
        .mock.calls.map((c) => c[0].inputIndex),
    ).toEqual([0, 1]);
  });

  it("refuses when readVaults returns a different number of reserves than requested", async () => {
    const input = makeInput({
      vaultIds: [VAULT_ID, SECOND_VAULT_ID],
      readVaults: vi.fn().mockResolvedValue([makeVaultData()]),
    });

    await expect(buildAndBroadcastReclaim(input)).rejects.toThrow(
      /does not match the request/,
    );
    expect(input.signPsbt).not.toHaveBeenCalled();
  });

  it("refuses a reserve whose PegIn does not hash to the requested vault id", async () => {
    // The script and value binds cannot catch this: both repeat across every
    // vault this depositor owns. Only the vault id distinguishes them.
    const input = makeInput();
    vi.mocked(deriveVaultId).mockResolvedValueOnce(SECOND_VAULT_ID);

    await expect(buildAndBroadcastReclaim(input)).rejects.toThrow(
      /belongs to vault 0x2222.*not the requested 0x1111/,
    );
    expect(buildReclaimPsbt).not.toHaveBeenCalled();
    expect(input.signPsbt).not.toHaveBeenCalled();
  });

  it("refuses a batch whose reserves come back in the wrong order", async () => {
    const input = makeInput({
      vaultIds: [VAULT_ID, SECOND_VAULT_ID],
      readVaults: vi
        .fn()
        .mockResolvedValue([makeVaultData(), makeVaultData()]),
    });
    // Same two vaults, swapped — a cardinality check cannot see this.
    vi.mocked(deriveVaultId)
      .mockResolvedValueOnce(SECOND_VAULT_ID)
      .mockResolvedValueOnce(VAULT_ID);

    await expect(buildAndBroadcastReclaim(input)).rejects.toThrow(
      /Reserve 0 belongs to vault/,
    );
    expect(input.signPsbt).not.toHaveBeenCalled();
  });

  it("finalizes the PSBT it built rather than the one the wallet returned", async () => {
    const input = makeInput();

    await buildAndBroadcastReclaim(input);

    expect(finalizeScriptPathWithSignatures).toHaveBeenCalledWith({
      requestedPsbtHex: "70736274ffmock",
      signaturesHex: ["aa".repeat(64)],
      signerXOnlyPubkeyHex: DEPOSITOR_PUBKEY,
    });
  });

  it("rejects an empty vault set", async () => {
    await expect(
      buildAndBroadcastReclaim(makeInput({ vaultIds: [] })),
    ).rejects.toThrow(/at least one vault id/);
  });

  it("rejects a non-positive fee rate", async () => {
    await expect(
      buildAndBroadcastReclaim(makeInput({ feeRate: 0 })),
    ).rejects.toThrow(/positive number/);
  });

  it("aborts before broadcasting when the signal fires", async () => {
    const controller = new AbortController();
    const input = makeInput({
      signal: controller.signal,
      signPsbt: vi.fn().mockImplementation(async () => {
        controller.abort();
        return "70736274ffsigned";
      }),
    });

    await expect(buildAndBroadcastReclaim(input)).rejects.toThrow();
    expect(input.broadcastTx).not.toHaveBeenCalled();
  });

  it("passes the swept reserves through to the builder in request order", async () => {
    const first = makeVaultData({ depositorSignedPeginTxHex: "0200000001" });
    const second = makeVaultData({ depositorSignedPeginTxHex: "0200000002" });
    vi.mocked(deriveVaultId)
      .mockResolvedValueOnce(VAULT_ID)
      .mockResolvedValueOnce(SECOND_VAULT_ID);
    await buildAndBroadcastReclaim(
      makeInput({
        vaultIds: [VAULT_ID, SECOND_VAULT_ID],
        readVaults: vi.fn().mockResolvedValue([first, second]),
      }),
    );

    const passed = vi.mocked(buildReclaimPsbt).mock.calls[0][0].inputs;
    expect(passed.map((r) => r.depositorSignedPeginTxHex)).toEqual([
      "0200000001",
      "0200000002",
    ]);
  });
});
