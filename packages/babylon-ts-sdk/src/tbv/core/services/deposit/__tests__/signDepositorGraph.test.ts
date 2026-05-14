import { Buffer } from "buffer";

import { describe, expect, it, vi } from "vitest";

import type { BitcoinWallet } from "../../../../../shared/wallets/interfaces";
import type { DepositorGraphTransactions } from "../../../clients/vault-provider/types";
import {
  type DepositorGraphSigningContext,
  signDepositorGraph,
} from "../signDepositorGraph";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
//
// signDepositorGraph orchestrates: validate output sinks → build PSBTs locally
// → batch sign → extract sigs. We mock the primitives so we can observe the
// exact inputs passed to each builder/validator without needing real
// Bitcoin transactions or WASM connectors.
// ---------------------------------------------------------------------------

const SIGNED_HEX_PREFIX = "signed_";
const MOCK_SIGNATURE_PREFIX = "sig_";
const MOCK_LOCAL_PAYOUT_PSBT_HEX = "local_payout_psbt_hex";
const MOCK_LOCAL_NOPAYOUT_PSBT_HEX_PREFIX = "local_nopayout_psbt_hex_";

vi.mock("../../../primitives/psbt/payout", () => ({
  extractPayoutSignature: (signedPsbtHex: string, _depositorPubkey: string) =>
    `${MOCK_SIGNATURE_PREFIX}${signedPsbtHex}`,
  assertPayoutOutputMatchesRegistered: vi.fn(),
  buildPayoutPsbt: vi.fn(async () => ({
    psbtHex: MOCK_LOCAL_PAYOUT_PSBT_HEX,
  })),
}));

vi.mock("../../../primitives/psbt/noPayout", () => ({
  assertNoPayoutOutputMatchesChallenger: vi.fn(),
  buildNoPayoutPsbt: vi.fn(
    async (params: { challengerPubkey: string }) =>
      `${MOCK_LOCAL_NOPAYOUT_PSBT_HEX_PREFIX}${params.challengerPubkey}`,
  ),
}));

// Stub Transaction.fromHex / .getId so we don't need real BTC tx hex in
// fixtures. Each unique hex returns a deterministic mock with the input it
// needs.
type MockTx = {
  ins: Array<{ hash: Buffer; index: number; sequence: number }>;
  outs: Array<{ script: Buffer; value: number }>;
  getId: () => string;
};

const MOCK_TX_REGISTRY: Map<string, MockTx> = new Map();

function registerMockTx(hex: string, tx: MockTx): void {
  MOCK_TX_REGISTRY.set(hex.toLowerCase(), tx);
}

function makeReversedHash(txid: string): Buffer {
  return Buffer.from(txid, "hex").reverse();
}

vi.mock("bitcoinjs-lib", () => ({
  Transaction: {
    fromHex: (hex: string) => {
      const tx = MOCK_TX_REGISTRY.get(hex.toLowerCase());
      if (!tx) {
        throw new Error(`MockTx not registered for hex: ${hex}`);
      }
      return tx;
    },
  },
}));

vi.mock("../../../primitives/utils/bitcoin", () => ({
  stripHexPrefix: (s: string) => (s.startsWith("0x") ? s.slice(2) : s),
  uint8ArrayToHex: (bytes: Uint8Array) =>
    Buffer.from(bytes).toString("hex"),
  validateWalletPubkey: (walletRaw: string, expectedDepositor: string) => {
    const stripped = walletRaw.startsWith("0x") ? walletRaw.slice(2) : walletRaw;
    const walletXOnly = stripped.length === 66 ? stripped.slice(2) : stripped;
    if (walletXOnly.toLowerCase() !== expectedDepositor.toLowerCase()) {
      throw new Error(
        `Wallet public key does not match vault depositor. Expected: ${expectedDepositor}, Got: ${walletXOnly}.`,
      );
    }
    return {
      walletPubkeyRaw: walletRaw,
      walletPubkeyXOnly: walletXOnly,
      depositorPubkey: expectedDepositor,
    };
  },
}));

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
// Wallet returns the depositor key in compressed (33-byte) form. The new
// validateWalletPubkey at the entry of signDepositorGraph strips the prefix
// byte to compare x-only with depositorBtcPubkey.
const WALLET_PUBKEY = `02${DEPOSITOR_PUBKEY}`;
const VP_PUBKEY = "f".repeat(64);
const UC_PUBKEY = "2".repeat(64);
const COUNCIL_MEMBER = "c".repeat(64);
// Local challengers (per protocol: {VP, VKs} \ {depositor}). Tests use these
// two as the canonical challenger pair so the supplied `challenger_presign_data`
// matches `localChallengers` derived from the signing context.
// CHALLENGER_A / CHALLENGER_B are two vault keepers. The depositor-graph
// challenger set per btc-vault is `LocalChallengers + UniversalChallengers`,
// where for the depositor-as-claimer flow LocalChallengers = VKs only
// (VP excluded). VK_PUBKEY remains a third, distinct vault keeper for tests
// that need overlap with the default context.
const CHALLENGER_A = "a".repeat(64);
const CHALLENGER_B = "b".repeat(64);
const REGISTERED_PAYOUT_SCRIPT = `0x5120${"e".repeat(64)}`;
const PEGIN_TX_HEX = "cafebabe";
const TIMELOCK_PEGIN = 50;
const TIMELOCK_ASSERT = 144;
const COUNCIL_QUORUM = 1;
const NETWORK = "regtest" as DepositorGraphSigningContext["network"];

const ASSERT_TXID = "11".repeat(32);
const ASSERT_TX_HEX = "assert_tx_hex";
const CAX_TXID_PREFIX = "22";
const CAY_TXID_PREFIX = "33";

function caxTxid(challengerPk: string): string {
  return `${CAX_TXID_PREFIX}${challengerPk.slice(0, 62)}`;
}

function cayTxid(challengerPk: string): string {
  return `${CAY_TXID_PREFIX}${challengerPk.slice(0, 62)}`;
}

function caxTxHex(challengerPk: string): string {
  return `cax_${challengerPk}`;
}

function cayTxHex(challengerPk: string): string {
  return `cay_${challengerPk}`;
}

function nopayoutTxHex(challengerPk: string): string {
  return `nopayout_${challengerPk}`;
}

function registerStandardMocks(challengerPubkeys: string[]): void {
  MOCK_TX_REGISTRY.clear();

  // Assert tx: at least one output (Assert:0) used as input 0's prevout.
  registerMockTx(ASSERT_TX_HEX, {
    ins: [],
    outs: [{ script: Buffer.from([0xab]), value: 1000 }],
    getId: () => ASSERT_TXID,
  });

  for (const pk of challengerPubkeys) {
    registerMockTx(caxTxHex(pk), {
      ins: [],
      outs: [{ script: Buffer.from([0xcc]), value: 200 }],
      getId: () => caxTxid(pk),
    });
    registerMockTx(cayTxHex(pk), {
      ins: [],
      outs: [{ script: Buffer.from([0xdd]), value: 300 }],
      getId: () => cayTxid(pk),
    });
    // NoPayout tx: 3 inputs in the protocol-defined order, all vout=0.
    registerMockTx(nopayoutTxHex(pk), {
      ins: [
        {
          hash: makeReversedHash(ASSERT_TXID),
          index: 0,
          sequence: 0xffffffff,
        },
        {
          hash: makeReversedHash(caxTxid(pk)),
          index: 0,
          sequence: 100,
        },
        {
          hash: makeReversedHash(cayTxid(pk)),
          index: 0,
          sequence: 100,
        },
      ],
      outs: [{ script: Buffer.from([0xee]), value: 1400 }],
      getId: () => `nopayout_id_${pk}`,
    });
  }
}

function createMockWallet(opts?: {
  supportsBatch?: boolean;
  pubkey?: string;
}): BitcoinWallet {
  const pubkey = opts?.pubkey ?? WALLET_PUBKEY;
  const signPsbt = vi.fn(async (hex: string) => `${SIGNED_HEX_PREFIX}${hex}`);
  const signPsbts = opts?.supportsBatch
    ? vi.fn(async (hexes: string[]) =>
        hexes.map((h) => `${SIGNED_HEX_PREFIX}${h}`),
      )
    : undefined;

  return {
    getPublicKeyHex: vi.fn(async () => pubkey),
    signPsbt,
    ...(signPsbts ? { signPsbts } : {}),
  } as unknown as BitcoinWallet;
}

function createDepositorGraph(
  challengerPubkeys: string[],
): DepositorGraphTransactions {
  return {
    claim_tx: { tx_hex: "deadbeef" },
    assert_tx: { tx_hex: ASSERT_TX_HEX },
    payout_tx: { tx_hex: "payout_tx_hex" },
    payout_psbt: btoa("vp_supplied_payout_psbt_unused"),
    challenger_presign_data: challengerPubkeys.map((pk) => ({
      challenger_pubkey: pk,
      challenge_assert_x_tx: { tx_hex: caxTxHex(pk) },
      challenge_assert_y_tx: { tx_hex: cayTxHex(pk) },
      nopayout_tx: { tx_hex: nopayoutTxHex(pk) },
      nopayout_psbt: btoa(`vp_supplied_nopayout_${pk}_unused`),
      challenge_assert_connectors: [],
      output_label_hashes: [],
    })),
    offchain_params_version: 1,
  };
}

function createSigningContext(
  overrides?: Partial<DepositorGraphSigningContext>,
): DepositorGraphSigningContext {
  // Default matches the depositor-as-claimer protocol: the daemon's
  // `challenger_presign_data` contains LocalChallengers (= VKs only, VP
  // excluded) ∪ UniversalChallengers. Default fixture uses 2 VKs and 0 UCs
  // so most tests can build a 2-entry graph; tests that need a UC override.
  return {
    peginTxHex: PEGIN_TX_HEX,
    depositorBtcPubkey: DEPOSITOR_PUBKEY,
    vaultProviderBtcPubkey: VP_PUBKEY,
    vaultKeeperBtcPubkeys: [CHALLENGER_A, CHALLENGER_B],
    universalChallengerBtcPubkeys: [],
    timelockPegin: TIMELOCK_PEGIN,
    timelockAssert: TIMELOCK_ASSERT,
    councilMembers: [COUNCIL_MEMBER],
    councilQuorum: COUNCIL_QUORUM,
    network: NETWORK,
    registeredPayoutScriptPubKey: REGISTERED_PAYOUT_SCRIPT,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("signDepositorGraph", () => {
  it("rebuilds the payout PSBT locally from authoritative connector params", async () => {
    registerStandardMocks([CHALLENGER_A, CHALLENGER_B]);
    const { buildPayoutPsbt } = await import(
      "../../../primitives/psbt/payout"
    );
    const builder = vi.mocked(buildPayoutPsbt);
    builder.mockClear();

    const wallet = createMockWallet({ supportsBatch: true });
    const graph = createDepositorGraph([CHALLENGER_A, CHALLENGER_B]);
    const ctx = createSigningContext();

    await signDepositorGraph({
      depositorGraph: graph,
      btcWallet: wallet,
      signingContext: ctx,
    });

    expect(builder).toHaveBeenCalledOnce();
    expect(builder).toHaveBeenCalledWith({
      payoutTxHex: graph.payout_tx.tx_hex,
      peginTxHex: ctx.peginTxHex,
      assertTxHex: graph.assert_tx.tx_hex,
      depositorBtcPubkey: ctx.depositorBtcPubkey,
      vaultProviderBtcPubkey: ctx.vaultProviderBtcPubkey,
      vaultKeeperBtcPubkeys: ctx.vaultKeeperBtcPubkeys,
      universalChallengerBtcPubkeys: ctx.universalChallengerBtcPubkeys,
      timelockPegin: ctx.timelockPegin,
      network: ctx.network,
    });
  });

  it("rebuilds each NoPayout PSBT locally with derived prevouts and assert-period connector params", async () => {
    registerStandardMocks([CHALLENGER_A, CHALLENGER_B]);
    const { buildNoPayoutPsbt } = await import(
      "../../../primitives/psbt/noPayout"
    );
    const builder = vi.mocked(buildNoPayoutPsbt);
    builder.mockClear();

    const wallet = createMockWallet({ supportsBatch: true });
    const graph = createDepositorGraph([CHALLENGER_A, CHALLENGER_B]);
    const ctx = createSigningContext();

    await signDepositorGraph({
      depositorGraph: graph,
      btcWallet: wallet,
      signingContext: ctx,
    });

    expect(builder).toHaveBeenCalledTimes(2);

    // localChallengers = VKs - {depositor} (depositor-as-claimer special
    // case per btc-vault). Depositor isn't a VK here, so both stay.
    const expectedLocalChallengers = [CHALLENGER_A, CHALLENGER_B];

    // Per-challenger payload should pin parent prevouts (Assert:0, CAX:0, CAY:0)
    // and pass the assert-period connector params.
    for (const [idx, challengerPk] of [CHALLENGER_A, CHALLENGER_B].entries()) {
      expect(builder).toHaveBeenNthCalledWith(idx + 1, {
        noPayoutTxHex: nopayoutTxHex(challengerPk),
        challengerPubkey: challengerPk,
        prevouts: [
          { script_pubkey: "ab", value: 1000 },
          { script_pubkey: "cc", value: 200 },
          { script_pubkey: "dd", value: 300 },
        ],
        connectorParams: {
          claimer: DEPOSITOR_PUBKEY,
          localChallengers: expectedLocalChallengers,
          universalChallengers: ctx.universalChallengerBtcPubkeys,
          timelockAssert: TIMELOCK_ASSERT,
          councilMembers: ctx.councilMembers,
          councilQuorum: COUNCIL_QUORUM,
        },
      });
    }
  });

  it("validates the NoPayout output sink before signing each challenger", async () => {
    registerStandardMocks([CHALLENGER_A, CHALLENGER_B]);
    const { assertNoPayoutOutputMatchesChallenger } = await import(
      "../../../primitives/psbt/noPayout"
    );
    const sinkValidator = vi.mocked(assertNoPayoutOutputMatchesChallenger);
    sinkValidator.mockClear();

    const wallet = createMockWallet({ supportsBatch: true });
    const graph = createDepositorGraph([CHALLENGER_A, CHALLENGER_B]);

    await signDepositorGraph({
      depositorGraph: graph,
      btcWallet: wallet,
      signingContext: createSigningContext(),
    });

    expect(sinkValidator).toHaveBeenCalledWith(
      nopayoutTxHex(CHALLENGER_A),
      CHALLENGER_A,
      NETWORK,
    );
  });

  it("propagates NoPayout output sink errors and never reaches the wallet", async () => {
    registerStandardMocks([CHALLENGER_A, CHALLENGER_B]);
    const { assertNoPayoutOutputMatchesChallenger } = await import(
      "../../../primitives/psbt/noPayout"
    );
    vi.mocked(assertNoPayoutOutputMatchesChallenger).mockImplementationOnce(
      () => {
        throw new Error(
          "NoPayout transaction does not pay to the expected challenger BIP-86 P2TR address",
        );
      },
    );

    const wallet = createMockWallet({ supportsBatch: true });
    const graph = createDepositorGraph([CHALLENGER_A, CHALLENGER_B]);

    await expect(
      signDepositorGraph({
        depositorGraph: graph,
        btcWallet: wallet,
        signingContext: createSigningContext(),
      }),
    ).rejects.toThrow("expected challenger BIP-86 P2TR address");

    expect(wallet.signPsbts).not.toHaveBeenCalled();
    expect(wallet.signPsbt).not.toHaveBeenCalled();
  });

  it("rejects a NoPayout that doesn't have exactly 3 inputs", async () => {
    registerStandardMocks([CHALLENGER_A, CHALLENGER_B]);
    // Replace the nopayout tx with a 2-input variant
    registerMockTx(nopayoutTxHex(CHALLENGER_A), {
      ins: [
        {
          hash: makeReversedHash(ASSERT_TXID),
          index: 0,
          sequence: 0xffffffff,
        },
        {
          hash: makeReversedHash(caxTxid(CHALLENGER_A)),
          index: 0,
          sequence: 100,
        },
      ],
      outs: [{ script: Buffer.from([0xee]), value: 1400 }],
      getId: () => `nopayout_id_${CHALLENGER_A}`,
    });

    const wallet = createMockWallet({ supportsBatch: true });
    const graph = createDepositorGraph([CHALLENGER_A, CHALLENGER_B]);

    await expect(
      signDepositorGraph({
        depositorGraph: graph,
        btcWallet: wallet,
        signingContext: createSigningContext(),
      }),
    ).rejects.toThrow("must have exactly 3 inputs");

    expect(wallet.signPsbts).not.toHaveBeenCalled();
  });

  it("rejects a NoPayout whose Assert input references a different parent txid", async () => {
    registerStandardMocks([CHALLENGER_A, CHALLENGER_B]);
    registerMockTx(nopayoutTxHex(CHALLENGER_A), {
      ins: [
        {
          // Wrong txid for Assert input - simulates a malicious VP swapping
          // the assert tx hex against a NoPayout that still commits to the
          // real assert txid.
          hash: makeReversedHash("99".repeat(32)),
          index: 0,
          sequence: 0xffffffff,
        },
        {
          hash: makeReversedHash(caxTxid(CHALLENGER_A)),
          index: 0,
          sequence: 100,
        },
        {
          hash: makeReversedHash(cayTxid(CHALLENGER_A)),
          index: 0,
          sequence: 100,
        },
      ],
      outs: [{ script: Buffer.from([0xee]), value: 1400 }],
      getId: () => `nopayout_id_${CHALLENGER_A}`,
    });

    const wallet = createMockWallet({ supportsBatch: true });
    const graph = createDepositorGraph([CHALLENGER_A, CHALLENGER_B]);

    await expect(
      signDepositorGraph({
        depositorGraph: graph,
        btcWallet: wallet,
        signingContext: createSigningContext(),
      }),
    ).rejects.toThrow("does not reference Assert");

    expect(wallet.signPsbts).not.toHaveBeenCalled();
  });

  it("rejects a NoPayout input that spends a non-zero vout of its parent", async () => {
    registerStandardMocks([CHALLENGER_A, CHALLENGER_B]);
    registerMockTx(nopayoutTxHex(CHALLENGER_A), {
      ins: [
        {
          hash: makeReversedHash(ASSERT_TXID),
          index: 1,
          sequence: 0xffffffff,
        },
        {
          hash: makeReversedHash(caxTxid(CHALLENGER_A)),
          index: 0,
          sequence: 100,
        },
        {
          hash: makeReversedHash(cayTxid(CHALLENGER_A)),
          index: 0,
          sequence: 100,
        },
      ],
      outs: [{ script: Buffer.from([0xee]), value: 1400 }],
      getId: () => `nopayout_id_${CHALLENGER_A}`,
    });

    const wallet = createMockWallet({ supportsBatch: true });
    const graph = createDepositorGraph([CHALLENGER_A, CHALLENGER_B]);

    await expect(
      signDepositorGraph({
        depositorGraph: graph,
        btcWallet: wallet,
        signingContext: createSigningContext(),
      }),
    ).rejects.toThrow("expected to spend Assert vout 0, got vout 1");
  });

  it("derives localChallengers as VKs \\ {depositor} (depositor-as-claimer special case)", async () => {
    // Per btc-vault `crates/vault/src/tx_graph/graph.rs:144-150`:
    // depositor-as-claimer ⇒ LocalChallengers = VKs only (VP excluded).
    // Defensively filter the depositor if it accidentally appears in the
    // VK list, even though `TxGraphParams::validate` forbids it on-chain.
    const OTHER_KEEPER = "9".repeat(64);
    registerStandardMocks([OTHER_KEEPER]);
    const { buildNoPayoutPsbt } = await import(
      "../../../primitives/psbt/noPayout"
    );
    const builder = vi.mocked(buildNoPayoutPsbt);
    builder.mockClear();

    const wallet = createMockWallet({
      supportsBatch: true,
      pubkey: `02${DEPOSITOR_PUBKEY}`,
    });
    const graph = createDepositorGraph([OTHER_KEEPER]);

    await signDepositorGraph({
      depositorGraph: graph,
      btcWallet: wallet,
      signingContext: createSigningContext({
        // Depositor is also accidentally listed as a VK; should be filtered.
        vaultKeeperBtcPubkeys: [DEPOSITOR_PUBKEY, OTHER_KEEPER],
      }),
    });

    const noPayoutCall = builder.mock.calls[0][0];
    expect(noPayoutCall.connectorParams.localChallengers).toEqual([
      OTHER_KEEPER,
    ]);
    // VP is intentionally NOT in localChallengers for the depositor flow.
    expect(noPayoutCall.connectorParams.localChallengers).not.toContain(
      VP_PUBKEY,
    );
  });

  it("signs payout and nopayout PSBTs and returns per-challenger signatures", async () => {
    registerStandardMocks([CHALLENGER_A, CHALLENGER_B]);
    const wallet = createMockWallet({ supportsBatch: true });
    const graph = createDepositorGraph([CHALLENGER_A, CHALLENGER_B]);

    const result = await signDepositorGraph({
      depositorGraph: graph,
      btcWallet: wallet,
      signingContext: createSigningContext(),
    });

    expect(result.payout_signatures.payout_signature).toContain(
      MOCK_LOCAL_PAYOUT_PSBT_HEX,
    );
    expect(result.per_challenger[CHALLENGER_A].nopayout_signature).toContain(
      `${MOCK_LOCAL_NOPAYOUT_PSBT_HEX_PREFIX}${CHALLENGER_A}`,
    );
    expect(result.per_challenger[CHALLENGER_B].nopayout_signature).toContain(
      `${MOCK_LOCAL_NOPAYOUT_PSBT_HEX_PREFIX}${CHALLENGER_B}`,
    );
  });

  it("uses batch signing when wallet supports signPsbts", async () => {
    registerStandardMocks([CHALLENGER_A, CHALLENGER_B]);
    const wallet = createMockWallet({ supportsBatch: true });
    const graph = createDepositorGraph([CHALLENGER_A, CHALLENGER_B]);

    await signDepositorGraph({
      depositorGraph: graph,
      btcWallet: wallet,
      signingContext: createSigningContext(),
    });

    expect(wallet.signPsbts).toHaveBeenCalledOnce();
    expect(wallet.signPsbt).not.toHaveBeenCalled();
  });

  it("falls back to sequential signPsbt when signPsbts is not available", async () => {
    registerStandardMocks([CHALLENGER_A, CHALLENGER_B]);
    const wallet = createMockWallet({ supportsBatch: false });
    const graph = createDepositorGraph([CHALLENGER_A, CHALLENGER_B]);

    await signDepositorGraph({
      depositorGraph: graph,
      btcWallet: wallet,
      signingContext: createSigningContext(),
    });

    // 1 payout + 2 nopayouts (one per challenger).
    expect(wallet.signPsbt).toHaveBeenCalledTimes(3);
  });

  it("throws when wallet returns wrong number of signed PSBTs", async () => {
    registerStandardMocks([CHALLENGER_A, CHALLENGER_B]);
    const wallet = createMockWallet({ supportsBatch: true });
    (wallet.signPsbts as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      "only_one",
    ]);
    const graph = createDepositorGraph([CHALLENGER_A, CHALLENGER_B]);

    await expect(
      signDepositorGraph({
        depositorGraph: graph,
        btcWallet: wallet,
        signingContext: createSigningContext(),
      }),
    ).rejects.toThrow("expected 3");
  });

  it("strips 0x prefix from depositor pubkey", async () => {
    registerStandardMocks([CHALLENGER_A, CHALLENGER_B]);
    const wallet = createMockWallet({ supportsBatch: true });
    const graph = createDepositorGraph([CHALLENGER_A, CHALLENGER_B]);

    const result = await signDepositorGraph({
      depositorGraph: graph,
      btcWallet: wallet,
      signingContext: createSigningContext({
        depositorBtcPubkey: `0x${DEPOSITOR_PUBKEY}`,
      }),
    });

    expect(result.payout_signatures.payout_signature).toBeDefined();
  });

  it("validates the payout output against the registered scriptPubKey before signing", async () => {
    registerStandardMocks([CHALLENGER_A, CHALLENGER_B]);
    const { assertPayoutOutputMatchesRegistered } = await import(
      "../../../primitives/psbt/payout"
    );
    const validator = vi.mocked(assertPayoutOutputMatchesRegistered);
    validator.mockClear();

    const wallet = createMockWallet({ supportsBatch: true });
    const graph = createDepositorGraph([CHALLENGER_A, CHALLENGER_B]);

    await signDepositorGraph({
      depositorGraph: graph,
      btcWallet: wallet,
      signingContext: createSigningContext(),
    });

    expect(validator).toHaveBeenCalledWith(
      graph.payout_tx.tx_hex,
      REGISTERED_PAYOUT_SCRIPT,
    );
  });

  it("propagates payout output validation errors and never reaches the wallet", async () => {
    registerStandardMocks([CHALLENGER_A, CHALLENGER_B]);
    const { assertPayoutOutputMatchesRegistered } = await import(
      "../../../primitives/psbt/payout"
    );
    vi.mocked(assertPayoutOutputMatchesRegistered).mockImplementationOnce(
      () => {
        throw new Error(
          "Payout transaction does not pay to the registered depositor payout address",
        );
      },
    );

    const wallet = createMockWallet({ supportsBatch: true });
    const graph = createDepositorGraph([CHALLENGER_A, CHALLENGER_B]);

    await expect(
      signDepositorGraph({
        depositorGraph: graph,
        btcWallet: wallet,
        signingContext: createSigningContext(),
      }),
    ).rejects.toThrow("registered depositor payout address");

    expect(wallet.signPsbts).not.toHaveBeenCalled();
    expect(wallet.signPsbt).not.toHaveBeenCalled();
  });

  // Audit #245: signDepositorGraph must validate the connected wallet's key
  // matches the on-chain registered depositor key BEFORE asking the wallet to
  // sign. Otherwise a rotated wallet account silently produces tapScriptSigs
  // keyed by the wrong pubkey and extractPayoutSignature throws an opaque
  // "no signature found" error after multiple wallet popups.
  it("rejects when wallet pubkey does not match registered depositor pubkey", async () => {
    registerStandardMocks([CHALLENGER_A, CHALLENGER_B]);
    const otherDepositor = "e".repeat(64);
    const wallet = createMockWallet({ supportsBatch: true });
    const graph = createDepositorGraph([CHALLENGER_A, CHALLENGER_B]);

    await expect(
      signDepositorGraph({
        depositorGraph: graph,
        btcWallet: wallet,
        signingContext: createSigningContext({
          depositorBtcPubkey: otherDepositor,
        }),
      }),
    ).rejects.toThrow("Wallet public key does not match vault depositor");

    expect(wallet.signPsbts).not.toHaveBeenCalled();
    expect(wallet.signPsbt).not.toHaveBeenCalled();
  });

  // Audit #303: VP-supplied challenger_presign_data must exactly equal
  // `LocalChallengers ∪ UniversalChallengers`. Missing entries → activation
  // with incomplete recovery material. Extra/duplicate entries → wallet
  // signs PSBTs for challengers the protocol doesn't recognize.
  it("rejects when VP omits a required local challenger", async () => {
    // expected = [CHALLENGER_A, CHALLENGER_B]; graph only supplies A.
    registerStandardMocks([CHALLENGER_A]);
    const wallet = createMockWallet({ supportsBatch: true });
    const graph = createDepositorGraph([CHALLENGER_A]);

    await expect(
      signDepositorGraph({
        depositorGraph: graph,
        btcWallet: wallet,
        signingContext: createSigningContext(),
      }),
    ).rejects.toThrow(/challenger set does not match expected/);

    expect(wallet.signPsbts).not.toHaveBeenCalled();
    expect(wallet.signPsbt).not.toHaveBeenCalled();
  });

  it("rejects when VP omits a required universal challenger", async () => {
    // expected = [CHALLENGER_A, CHALLENGER_B, UC_PUBKEY]; graph drops UC.
    registerStandardMocks([CHALLENGER_A, CHALLENGER_B]);
    const wallet = createMockWallet({ supportsBatch: true });
    const graph = createDepositorGraph([CHALLENGER_A, CHALLENGER_B]);

    await expect(
      signDepositorGraph({
        depositorGraph: graph,
        btcWallet: wallet,
        signingContext: createSigningContext({
          universalChallengerBtcPubkeys: [UC_PUBKEY],
        }),
      }),
    ).rejects.toThrow(
      new RegExp(`challenger set does not match expected.*missing.*${UC_PUBKEY}`),
    );

    expect(wallet.signPsbts).not.toHaveBeenCalled();
    expect(wallet.signPsbt).not.toHaveBeenCalled();
  });

  it("rejects when VP returns an empty challenger_presign_data array", async () => {
    registerStandardMocks([]);
    const wallet = createMockWallet({ supportsBatch: true });
    const graph = createDepositorGraph([]);

    await expect(
      signDepositorGraph({
        depositorGraph: graph,
        btcWallet: wallet,
        signingContext: createSigningContext(),
      }),
    ).rejects.toThrow(/challenger set does not match expected/);

    expect(wallet.signPsbts).not.toHaveBeenCalled();
    expect(wallet.signPsbt).not.toHaveBeenCalled();
  });

  it("rejects when VP injects a duplicate challenger entry", async () => {
    registerStandardMocks([CHALLENGER_A, CHALLENGER_B]);
    const wallet = createMockWallet({ supportsBatch: true });
    // Two entries for CHALLENGER_A would otherwise produce two NoPayout
    // signatures the protocol doesn't recognize.
    const graph = createDepositorGraph([CHALLENGER_A, CHALLENGER_A]);

    await expect(
      signDepositorGraph({
        depositorGraph: graph,
        btcWallet: wallet,
        signingContext: createSigningContext(),
      }),
    ).rejects.toThrow(/duplicate challenger entries/);

    expect(wallet.signPsbts).not.toHaveBeenCalled();
    expect(wallet.signPsbt).not.toHaveBeenCalled();
  });

  it("rejects when VP supplies an unexpected challenger not in the expected set", async () => {
    const STRANGER = "9".repeat(64);
    registerStandardMocks([CHALLENGER_A, CHALLENGER_B, STRANGER]);
    const wallet = createMockWallet({ supportsBatch: true });
    const graph = createDepositorGraph([CHALLENGER_A, CHALLENGER_B, STRANGER]);

    await expect(
      signDepositorGraph({
        depositorGraph: graph,
        btcWallet: wallet,
        signingContext: createSigningContext(),
      }),
    ).rejects.toThrow(/unexpected:.*9{64}/);

    expect(wallet.signPsbts).not.toHaveBeenCalled();
    expect(wallet.signPsbt).not.toHaveBeenCalled();
  });

  it("rejects misconfigured context where a vault keeper duplicates a universal challenger", async () => {
    // Local and universal challenger sets must be disjoint per the protocol.
    // If the same key appears in both, depositor would sign for an ambiguous
    // role; reject loudly rather than silently dedupe.
    registerStandardMocks([CHALLENGER_A, CHALLENGER_B]);
    const wallet = createMockWallet({ supportsBatch: true });
    const graph = createDepositorGraph([CHALLENGER_A, CHALLENGER_B]);

    await expect(
      signDepositorGraph({
        depositorGraph: graph,
        btcWallet: wallet,
        signingContext: createSigningContext({
          vaultKeeperBtcPubkeys: [CHALLENGER_A, CHALLENGER_B],
          // CHALLENGER_A also appears in universal — overlap.
          universalChallengerBtcPubkeys: [CHALLENGER_A],
        }),
      }),
    ).rejects.toThrow(/vault keepers and universal challengers overlap/);

    expect(wallet.signPsbts).not.toHaveBeenCalled();
    expect(wallet.signPsbt).not.toHaveBeenCalled();
  });

  it("rejects misconfigured context where vault keepers contain a duplicate", async () => {
    registerStandardMocks([CHALLENGER_A]);
    const wallet = createMockWallet({ supportsBatch: true });
    const graph = createDepositorGraph([CHALLENGER_A]);

    await expect(
      signDepositorGraph({
        depositorGraph: graph,
        btcWallet: wallet,
        signingContext: createSigningContext({
          vaultKeeperBtcPubkeys: [CHALLENGER_A, CHALLENGER_A],
        }),
      }),
    ).rejects.toThrow(/duplicate vaultKeeper key/);

    expect(wallet.signPsbts).not.toHaveBeenCalled();
    expect(wallet.signPsbt).not.toHaveBeenCalled();
  });
});
