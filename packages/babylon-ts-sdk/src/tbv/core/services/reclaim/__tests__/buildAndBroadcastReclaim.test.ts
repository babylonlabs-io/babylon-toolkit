/**
 * Reclaim orchestration tests.
 *
 * The PSBT builder and its binds have their own suite; here the contract under
 * test is the orchestration — fee caps, call order, per-input signature
 * verification, and abort handling.
 */

import type { Hex } from "viem";
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

vi.mock("bitcoinjs-lib", async (importOriginal) => {
  const actual = await importOriginal<typeof import("bitcoinjs-lib")>();
  return {
    ...actual,
    Psbt: {
      ...actual.Psbt,
      fromHex: vi.fn().mockReturnValue({
        finalizeAllInputs: vi.fn(),
        extractTransaction: () => ({ toHex: () => "signedtxhex" }),
      }),
    },
  };
});

const { buildReclaimPsbt } = await import("../../../primitives/psbt/reclaim");
const { assertScriptPathSchnorrSignature } = await import(
  "../../../primitives/psbt/verifyScriptPathSchnorrSignature"
);
const { extractPayoutSignature } = await import(
  "../../../primitives/psbt/payout"
);

const VAULT_ID = `0x${"11".repeat(32)}` as Hex;
const DEPOSITOR_PUBKEY =
  "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const CLAIM_VALUE = 33_000n;

function makeVaultData(
  overrides: Partial<ReclaimVaultData> = {},
): ReclaimVaultData {
  return {
    depositorSignedPeginTxHex: "0200000000",
    observed: { scriptPubKey: "5120" + "ab".repeat(32), value: CLAIM_VALUE },
    expectedClaimValue: CLAIM_VALUE,
    ...overrides,
  };
}

function makeInput(overrides: Record<string, unknown> = {}) {
  return {
    vaultIds: [VAULT_ID],
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
      vaultIds: [VAULT_ID, `0x${"22".repeat(32)}` as Hex],
      readVaults: vi
        .fn()
        .mockResolvedValue([makeVaultData(), makeVaultData()]),
    });

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
      vaultIds: [VAULT_ID, `0x${"22".repeat(32)}` as Hex],
      readVaults: vi.fn().mockResolvedValue([makeVaultData()]),
    });

    await expect(buildAndBroadcastReclaim(input)).rejects.toThrow(
      /does not match the request/,
    );
    expect(input.signPsbt).not.toHaveBeenCalled();
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
    await buildAndBroadcastReclaim(
      makeInput({
        vaultIds: [VAULT_ID, `0x${"22".repeat(32)}` as Hex],
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
