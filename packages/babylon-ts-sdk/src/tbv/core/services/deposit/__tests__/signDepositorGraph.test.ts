import { Buffer } from "buffer";

import { describe, expect, it, vi } from "vitest";

import type { BitcoinWallet } from "../../../../../shared/wallets/interfaces";
import type { DepositorGraphTransactions } from "../../../clients/vault-provider/types";
import { signDepositorGraph } from "../signDepositorGraph";

// ---------------------------------------------------------------------------
// Mock PSBT layer — Psbt.fromBase64 / fromHex and extractPayoutSignature
// use real bitcoinjs-lib internals which need real PSBTs. We mock them to
// test the orchestration logic (collect → sign → extract → assemble).
// ---------------------------------------------------------------------------

// Deterministic "signed hex" returned by the mock wallet
const SIGNED_HEX_PREFIX = "signed_";

// Deterministic "signature" returned by extractPayoutSignature mock
const MOCK_SIGNATURE_PREFIX = "sig_";

// Mock extractPayoutSignature and the output-script validator. The validator
// is a no-op here so we don't need real Bitcoin transactions; its behavior is
// covered by tests in primitives/psbt/payout.
vi.mock("../../../primitives/psbt/payout", () => ({
  extractPayoutSignature: (signedPsbtHex: string, _depositorPubkey: string) => {
    // Use the signedPsbtHex as the key for deterministic output
    return `${MOCK_SIGNATURE_PREFIX}${signedPsbtHex}`;
  },
  assertPayoutOutputMatchesRegistered: vi.fn(),
}));

// Mock the PSBT verification/sanitization layer so we don't need real PSBTs.
// The mocked input must satisfy the script-path shape checks in
// verifyAndParsePsbt: witnessUtxo, tapInternalKey, and a non-empty
// tapLeafScript, with no pre-existing signatures or finalization.
vi.mock("bitcoinjs-lib", () => {
  const buildMockPsbt = () => {
    const mockInput = {
      witnessUtxo: { script: Buffer.from(""), value: 0 },
      tapInternalKey: Buffer.from(""),
      tapLeafScript: [
        {
          leafVersion: 0xc0,
          script: Buffer.from(""),
          controlBlock: Buffer.from(""),
        },
      ],
    };
    return {
      data: {
        inputs: [mockInput],
        getTransaction: () => ({
          toString: () => "deadbeef",
        }),
      },
      toHex: () => "mock_psbt_hex",
    };
  };
  return {
    Psbt: {
      fromBase64: () => buildMockPsbt(),
      fromHex: () => buildMockPsbt(),
    },
  };
});

// Mock stripHexPrefix to pass through (the real one strips 0x)
vi.mock("../../../primitives/utils/bitcoin", () => ({
  stripHexPrefix: (s: string) =>
    s.startsWith("0x") ? s.slice(2) : s,
}));

// Mock createTaprootScriptPathSignOptions
vi.mock("../../../utils/signing", () => ({
  createTaprootScriptPathSignOptions: (pubkey: string, inputCount: number) => ({
    autoFinalized: false,
    signInputs: Array.from({ length: inputCount }, (_, i) => ({
      index: i,
      publicKey: pubkey,
      useTweakedSigner: false,
    })),
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEPOSITOR_PUBKEY = "d".repeat(64);
const WALLET_PUBKEY = "w".repeat(64);
const CHALLENGER_A = "a".repeat(64);
const CHALLENGER_B = "b".repeat(64);
const REGISTERED_PAYOUT_SCRIPT = `0x5120${"e".repeat(64)}`;

function createMockWallet(opts?: {
  supportsBatch?: boolean;
}): BitcoinWallet {
  const signPsbt = vi.fn(async (hex: string) => `${SIGNED_HEX_PREFIX}${hex}`);
  const signPsbts = opts?.supportsBatch
    ? vi.fn(async (hexes: string[]) =>
        hexes.map((h) => `${SIGNED_HEX_PREFIX}${h}`),
      )
    : undefined;

  return {
    getPublicKeyHex: vi.fn(async () => WALLET_PUBKEY),
    signPsbt,
    ...(signPsbts ? { signPsbts } : {}),
  } as unknown as BitcoinWallet;
}

function createDepositorGraph(
  challengerPubkeys: string[],
): DepositorGraphTransactions {
  return {
    claim_tx: { tx_hex: "deadbeef" },
    assert_tx: { tx_hex: "deadbeef" },
    payout_tx: { tx_hex: "deadbeef" },
    payout_psbt: btoa("mock_payout_psbt"),
    challenger_presign_data: challengerPubkeys.map((pk) => ({
      challenger_pubkey: pk,
      challenge_assert_x_tx: { tx_hex: "deadbeef" },
      challenge_assert_y_tx: { tx_hex: "deadbeef" },
      nopayout_tx: { tx_hex: "deadbeef" },
      nopayout_psbt: btoa(`mock_nopayout_${pk}`),
      challenge_assert_connectors: [],
      output_label_hashes: [],
    })),
    offchain_params_version: 1,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("signDepositorGraph", () => {
  it("signs payout and nopayout PSBTs for each challenger", async () => {
    const wallet = createMockWallet({ supportsBatch: true });
    const graph = createDepositorGraph([CHALLENGER_A, CHALLENGER_B]);

    const result = await signDepositorGraph({
      depositorGraph: graph,
      depositorBtcPubkey: DEPOSITOR_PUBKEY,
      btcWallet: wallet,
      registeredPayoutScriptPubKey: REGISTERED_PAYOUT_SCRIPT,
    });

    // Payout signature present
    expect(result.payout_signatures.payout_signature).toBeDefined();
    expect(result.payout_signatures.payout_signature).toContain(
      MOCK_SIGNATURE_PREFIX,
    );

    // Per-challenger nopayout signatures present
    expect(result.per_challenger[CHALLENGER_A]).toBeDefined();
    expect(
      result.per_challenger[CHALLENGER_A].nopayout_signature,
    ).toContain(MOCK_SIGNATURE_PREFIX);

    expect(result.per_challenger[CHALLENGER_B]).toBeDefined();
    expect(
      result.per_challenger[CHALLENGER_B].nopayout_signature,
    ).toContain(MOCK_SIGNATURE_PREFIX);
  });

  it("uses batch signing when wallet supports signPsbts", async () => {
    const wallet = createMockWallet({ supportsBatch: true });
    const graph = createDepositorGraph([CHALLENGER_A]);

    await signDepositorGraph({
      depositorGraph: graph,
      depositorBtcPubkey: DEPOSITOR_PUBKEY,
      btcWallet: wallet,
      registeredPayoutScriptPubKey: REGISTERED_PAYOUT_SCRIPT,
    });

    // signPsbts should be called (batch), not signPsbt (sequential)
    expect(wallet.signPsbts).toHaveBeenCalledOnce();
    expect(wallet.signPsbt).not.toHaveBeenCalled();
  });

  it("falls back to sequential signPsbt when signPsbts is not available", async () => {
    const wallet = createMockWallet({ supportsBatch: false });
    const graph = createDepositorGraph([CHALLENGER_A]);

    await signDepositorGraph({
      depositorGraph: graph,
      depositorBtcPubkey: DEPOSITOR_PUBKEY,
      btcWallet: wallet,
      registeredPayoutScriptPubKey: REGISTERED_PAYOUT_SCRIPT,
    });

    // 2 PSBTs total: 1 payout + 1 nopayout
    expect(wallet.signPsbt).toHaveBeenCalledTimes(2);
  });

  it("throws when wallet returns wrong number of signed PSBTs", async () => {
    const wallet = createMockWallet({ supportsBatch: true });
    // Override signPsbts to return wrong count
    (wallet.signPsbts as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      "only_one",
    ]);
    const graph = createDepositorGraph([CHALLENGER_A]);

    await expect(
      signDepositorGraph({
        depositorGraph: graph,
        depositorBtcPubkey: DEPOSITOR_PUBKEY,
        btcWallet: wallet,
        registeredPayoutScriptPubKey: REGISTERED_PAYOUT_SCRIPT,
      }),
    ).rejects.toThrow("expected 2");
  });

  it("handles graph with no challengers (payout only)", async () => {
    const wallet = createMockWallet({ supportsBatch: true });
    const graph = createDepositorGraph([]);

    const result = await signDepositorGraph({
      depositorGraph: graph,
      depositorBtcPubkey: DEPOSITOR_PUBKEY,
      btcWallet: wallet,
      registeredPayoutScriptPubKey: REGISTERED_PAYOUT_SCRIPT,
    });

    expect(result.payout_signatures.payout_signature).toBeDefined();
    expect(Object.keys(result.per_challenger)).toHaveLength(0);
  });

  it("strips 0x prefix from depositor pubkey", async () => {
    const wallet = createMockWallet({ supportsBatch: true });
    const graph = createDepositorGraph([CHALLENGER_A]);

    const result = await signDepositorGraph({
      depositorGraph: graph,
      depositorBtcPubkey: `0x${DEPOSITOR_PUBKEY}`,
      btcWallet: wallet,
      registeredPayoutScriptPubKey: REGISTERED_PAYOUT_SCRIPT,
    });

    // Should still produce valid signatures (no error about prefix)
    expect(result.payout_signatures.payout_signature).toBeDefined();
  });

  it("validates the payout output against the registered scriptPubKey before signing", async () => {
    const { assertPayoutOutputMatchesRegistered } = await import(
      "../../../primitives/psbt/payout"
    );
    const validator = vi.mocked(assertPayoutOutputMatchesRegistered);
    validator.mockClear();

    const wallet = createMockWallet({ supportsBatch: true });
    const graph = createDepositorGraph([CHALLENGER_A]);

    await signDepositorGraph({
      depositorGraph: graph,
      depositorBtcPubkey: DEPOSITOR_PUBKEY,
      btcWallet: wallet,
      registeredPayoutScriptPubKey: REGISTERED_PAYOUT_SCRIPT,
    });

    expect(validator).toHaveBeenCalledWith(
      graph.payout_tx.tx_hex,
      REGISTERED_PAYOUT_SCRIPT,
    );
  });

  it("propagates payout output validation errors and never reaches the wallet", async () => {
    const { assertPayoutOutputMatchesRegistered } = await import(
      "../../../primitives/psbt/payout"
    );
    const validator = vi.mocked(assertPayoutOutputMatchesRegistered);
    validator.mockImplementationOnce(() => {
      throw new Error(
        "Payout transaction does not pay to the registered depositor payout address",
      );
    });

    const wallet = createMockWallet({ supportsBatch: true });
    const graph = createDepositorGraph([CHALLENGER_A]);

    await expect(
      signDepositorGraph({
        depositorGraph: graph,
        depositorBtcPubkey: DEPOSITOR_PUBKEY,
        btcWallet: wallet,
        registeredPayoutScriptPubKey: REGISTERED_PAYOUT_SCRIPT,
      }),
    ).rejects.toThrow("registered depositor payout address");

    expect(wallet.signPsbts).not.toHaveBeenCalled();
    expect(wallet.signPsbt).not.toHaveBeenCalled();
  });
});
