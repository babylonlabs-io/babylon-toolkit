import { describe, expect, it, vi } from "vitest";

import type { BitcoinWallet } from "../../../../../shared/wallets/interfaces";
import type { DepositorGraphTransactions } from "../../../clients/vault-provider/types";
import { signDepositorGraph } from "../signDepositorGraph";

// ---------------------------------------------------------------------------
// Mock PSBT and Transaction layers — bitcoinjs-lib's real internals need real
// PSBTs/raw txs. We mock them to test the orchestration logic
// (collect → cross-check → sign → extract → assemble).
//
// Each `tx_hex` string is treated as its own deterministic txid. PSBT inputs
// reference the parent by reusing the parent hex, so validation can match
// txid-against-parent and witnessUtxo-against-parent without needing real
// Bitcoin serialization.
// ---------------------------------------------------------------------------

const SIGNED_HEX_PREFIX = "signed_";
const MOCK_SIGNATURE_PREFIX = "sig_";

// Mock txids must be valid 64-char hex so the verifier can round-trip them
// through inputTxidHex (which reverses the input's `hash` bytes).
const PEGIN_TX_HEX = "11".repeat(32);
const GRAPH_ASSERT_TX_HEX = "22".repeat(32);
const PAYOUT_TX_HEX = "33".repeat(32);
const VAULT_SCRIPT_HEX = "5120" + "01".repeat(32);
const ASSERT_SCRIPT_HEX = "5120" + "02".repeat(32);
const VAULT_VALUE = 100_000;
const ASSERT_VALUE = 50_000;

function txidToHashBuffer(txid: string): Uint8Array {
  if (!/^[0-9a-fA-F]{64}$/.test(txid)) {
    throw new Error(`txidToHashBuffer requires 64-char hex, got ${txid}`);
  }
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(txid.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes.reverse();
}

interface MockInput {
  hash: Uint8Array;
  index: number;
  sequence: number;
}
interface MockOutput {
  script: Uint8Array;
  value: number;
}
interface MockTx {
  ins: MockInput[];
  outs: MockOutput[];
  getId: () => string;
}

const txStore = new Map<string, MockTx>();

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    out[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return out;
}

function registerTx(txid: string, tx: Omit<MockTx, "getId">): MockTx {
  const full: MockTx = { ...tx, getId: () => txid };
  txStore.set(txid, full);
  return full;
}

function nopayoutTxId(challenger: string): string {
  return `nopayout_${challenger.slice(0, 8)}`;
}

interface MockPsbtInput {
  witnessUtxo?: { script: Uint8Array; value: number };
  tapBip32Derivation?: unknown;
  tapMerkleRoot?: unknown;
}

const psbtStore = new Map<
  string,
  { txHex: string; inputs: MockPsbtInput[] }
>();

function registerPsbt(
  base64Tag: string,
  txHex: string,
  inputs: MockPsbtInput[],
): string {
  psbtStore.set(base64Tag, { txHex, inputs });
  return base64Tag;
}

vi.mock("../../../primitives/psbt/payout", () => ({
  extractPayoutSignature: (signedPsbtHex: string, _depositorPubkey: string) =>
    `${MOCK_SIGNATURE_PREFIX}${signedPsbtHex}`,
}));

vi.mock("../../../primitives/utils/bitcoin", () => {
  const uint8ArrayToHex = (bytes: Uint8Array) =>
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  return {
    stripHexPrefix: (s: string) => (s.startsWith("0x") ? s.slice(2) : s),
    uint8ArrayToHex,
    inputTxidHex: (input: { hash: Buffer | Uint8Array }) =>
      uint8ArrayToHex(new Uint8Array(input.hash).slice().reverse()),
  };
});

vi.mock("bitcoinjs-lib", () => {
  function buildPsbt(tag: string) {
    const entry = psbtStore.get(tag);
    if (!entry) {
      throw new Error(`No mock PSBT registered for ${tag}`);
    }
    const inputs = entry.inputs.map((i) => ({ ...i }));
    return {
      data: {
        inputs,
        getTransaction: () => ({
          toString: () => entry.txHex,
        }),
      },
      toHex: () => `psbt_${tag}`,
    };
  }
  return {
    Psbt: {
      fromBase64: (s: string) => buildPsbt(s),
      fromHex: (h: string) => {
        // sanitizePsbtForScriptPathSigning re-parses by hex from the prior PSBT
        const tag = h.startsWith("psbt_") ? h.slice("psbt_".length) : h;
        return buildPsbt(tag);
      },
    },
    Transaction: {
      fromHex: (hex: string) => {
        const tx = txStore.get(hex);
        if (!tx) {
          throw new Error(`No mock Transaction registered for ${hex}`);
        }
        return tx;
      },
    },
  };
});

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

function createMockWallet(opts?: { supportsBatch?: boolean }): BitcoinWallet {
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

function setupValidGraph(challengerPubkeys: string[]): {
  graph: DepositorGraphTransactions;
  peginTxHex: string;
} {
  txStore.clear();
  psbtStore.clear();

  registerTx(PEGIN_TX_HEX, {
    ins: [],
    outs: [{ script: hexToBytes(VAULT_SCRIPT_HEX), value: VAULT_VALUE }],
  });
  registerTx(GRAPH_ASSERT_TX_HEX, {
    ins: [],
    outs: [{ script: hexToBytes(ASSERT_SCRIPT_HEX), value: ASSERT_VALUE }],
  });

  // Payout child tx: input 0 = PegIn:0, input 1 = Assert:0
  registerTx(PAYOUT_TX_HEX, {
    ins: [
      { hash: txidToHashBuffer(PEGIN_TX_HEX), index: 0, sequence: 0xffffffff },
      {
        hash: txidToHashBuffer(GRAPH_ASSERT_TX_HEX),
        index: 0,
        sequence: 0xffffffff,
      },
    ],
    outs: [],
  });

  registerPsbt("payout_psbt_b64", PAYOUT_TX_HEX, [
    { witnessUtxo: { script: hexToBytes(VAULT_SCRIPT_HEX), value: VAULT_VALUE } },
    {
      witnessUtxo: { script: hexToBytes(ASSERT_SCRIPT_HEX), value: ASSERT_VALUE },
    },
  ]);

  const graph: DepositorGraphTransactions = {
    claim_tx: { tx_hex: "claim0001" },
    assert_tx: { tx_hex: GRAPH_ASSERT_TX_HEX },
    payout_tx: { tx_hex: PAYOUT_TX_HEX },
    payout_psbt: "payout_psbt_b64",
    challenger_presign_data: challengerPubkeys.map((pk) => {
      const npHex = nopayoutTxId(pk);
      // NoPayout child tx: input 0 = Assert:0
      registerTx(npHex, {
        ins: [
          {
            hash: txidToHashBuffer(GRAPH_ASSERT_TX_HEX),
            index: 0,
            sequence: 0xffffffff,
          },
        ],
        outs: [],
      });
      const psbtTag = `nopayout_psbt_${pk.slice(0, 8)}`;
      registerPsbt(psbtTag, npHex, [
        {
          witnessUtxo: {
            script: hexToBytes(ASSERT_SCRIPT_HEX),
            value: ASSERT_VALUE,
          },
        },
      ]);
      return {
        challenger_pubkey: pk,
        challenge_assert_x_tx: { tx_hex: "ca_x" },
        challenge_assert_y_tx: { tx_hex: "ca_y" },
        nopayout_tx: { tx_hex: npHex },
        nopayout_psbt: psbtTag,
        challenge_assert_connectors: [],
        output_label_hashes: [],
      };
    }),
    offchain_params_version: 1,
  };

  return { graph, peginTxHex: PEGIN_TX_HEX };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("signDepositorGraph", () => {
  it("signs payout and nopayout PSBTs for each challenger", async () => {
    const wallet = createMockWallet({ supportsBatch: true });
    const { graph, peginTxHex } = setupValidGraph([CHALLENGER_A, CHALLENGER_B]);

    const result = await signDepositorGraph({
      depositorGraph: graph,
      peginTxHex,
      depositorBtcPubkey: DEPOSITOR_PUBKEY,
      btcWallet: wallet,
    });

    expect(result.payout_signatures.payout_signature).toContain(
      MOCK_SIGNATURE_PREFIX,
    );
    expect(
      result.per_challenger[CHALLENGER_A].nopayout_signature,
    ).toContain(MOCK_SIGNATURE_PREFIX);
    expect(
      result.per_challenger[CHALLENGER_B].nopayout_signature,
    ).toContain(MOCK_SIGNATURE_PREFIX);
  });

  it("uses batch signing when wallet supports signPsbts", async () => {
    const wallet = createMockWallet({ supportsBatch: true });
    const { graph, peginTxHex } = setupValidGraph([CHALLENGER_A]);

    await signDepositorGraph({
      depositorGraph: graph,
      peginTxHex,
      depositorBtcPubkey: DEPOSITOR_PUBKEY,
      btcWallet: wallet,
    });

    expect(wallet.signPsbts).toHaveBeenCalledOnce();
    expect(wallet.signPsbt).not.toHaveBeenCalled();
  });

  it("falls back to sequential signPsbt when signPsbts is not available", async () => {
    const wallet = createMockWallet({ supportsBatch: false });
    const { graph, peginTxHex } = setupValidGraph([CHALLENGER_A]);

    await signDepositorGraph({
      depositorGraph: graph,
      peginTxHex,
      depositorBtcPubkey: DEPOSITOR_PUBKEY,
      btcWallet: wallet,
    });

    expect(wallet.signPsbt).toHaveBeenCalledTimes(2);
  });

  it("throws when wallet returns wrong number of signed PSBTs", async () => {
    const wallet = createMockWallet({ supportsBatch: true });
    (wallet.signPsbts as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      "only_one",
    ]);
    const { graph, peginTxHex } = setupValidGraph([CHALLENGER_A]);

    await expect(
      signDepositorGraph({
        depositorGraph: graph,
        peginTxHex,
        depositorBtcPubkey: DEPOSITOR_PUBKEY,
        btcWallet: wallet,
      }),
    ).rejects.toThrow("expected 2");
  });

  it("handles graph with no challengers (payout only)", async () => {
    const wallet = createMockWallet({ supportsBatch: true });
    const { graph, peginTxHex } = setupValidGraph([]);

    const result = await signDepositorGraph({
      depositorGraph: graph,
      peginTxHex,
      depositorBtcPubkey: DEPOSITOR_PUBKEY,
      btcWallet: wallet,
    });

    expect(result.payout_signatures.payout_signature).toBeDefined();
    expect(Object.keys(result.per_challenger)).toHaveLength(0);
  });

  it("rejects payout PSBT when input 0 does not reference the on-chain pegin tx", async () => {
    const wallet = createMockWallet({ supportsBatch: true });
    const { graph, peginTxHex } = setupValidGraph([CHALLENGER_A]);

    // Substitute payout input 0 with an attacker-chosen parent
    const ATTACKER_PEGIN_HEX = "aa".repeat(32);
    registerTx(ATTACKER_PEGIN_HEX, {
      ins: [],
      outs: [{ script: hexToBytes(VAULT_SCRIPT_HEX), value: VAULT_VALUE }],
    });
    const payout = txStore.get(PAYOUT_TX_HEX)!;
    payout.ins[0] = {
      hash: txidToHashBuffer(ATTACKER_PEGIN_HEX),
      index: 0,
      sequence: 0xffffffff,
    };

    await expect(
      signDepositorGraph({
        depositorGraph: graph,
        peginTxHex,
        depositorBtcPubkey: DEPOSITOR_PUBKEY,
        btcWallet: wallet,
      }),
    ).rejects.toThrow(/depositor payout: input 0 must spend/);
  });

  it("rejects payout PSBT when input 0 witnessUtxo value diverges from on-chain pegin output", async () => {
    const wallet = createMockWallet({ supportsBatch: true });
    const { graph, peginTxHex } = setupValidGraph([CHALLENGER_A]);

    const psbt = psbtStore.get("payout_psbt_b64")!;
    psbt.inputs[0].witnessUtxo = {
      script: hexToBytes(VAULT_SCRIPT_HEX),
      value: VAULT_VALUE + 1,
    };

    await expect(
      signDepositorGraph({
        depositorGraph: graph,
        peginTxHex,
        depositorBtcPubkey: DEPOSITOR_PUBKEY,
        btcWallet: wallet,
      }),
    ).rejects.toThrow(/witnessUtxo value/);
  });

  it("rejects payout PSBT with fewer than 2 inputs", async () => {
    const wallet = createMockWallet({ supportsBatch: true });
    const { graph, peginTxHex } = setupValidGraph([CHALLENGER_A]);

    const payout = txStore.get(PAYOUT_TX_HEX)!;
    payout.ins = [payout.ins[0]];
    const psbt = psbtStore.get("payout_psbt_b64")!;
    psbt.inputs = [psbt.inputs[0]];

    await expect(
      signDepositorGraph({
        depositorGraph: graph,
        peginTxHex,
        depositorBtcPubkey: DEPOSITOR_PUBKEY,
        btcWallet: wallet,
      }),
    ).rejects.toThrow(/must have exactly 2 inputs, got 1/);
  });

  it("rejects payout PSBT when input 1 does not reference the graph assert tx", async () => {
    const wallet = createMockWallet({ supportsBatch: true });
    const { graph, peginTxHex } = setupValidGraph([CHALLENGER_A]);

    const ATTACKER_ASSERT_HEX = "cc".repeat(32);
    registerTx(ATTACKER_ASSERT_HEX, {
      ins: [],
      outs: [{ script: hexToBytes(ASSERT_SCRIPT_HEX), value: ASSERT_VALUE }],
    });
    const payout = txStore.get(PAYOUT_TX_HEX)!;
    payout.ins[1] = {
      hash: txidToHashBuffer(ATTACKER_ASSERT_HEX),
      index: 0,
      sequence: 0xffffffff,
    };

    await expect(
      signDepositorGraph({
        depositorGraph: graph,
        peginTxHex,
        depositorBtcPubkey: DEPOSITOR_PUBKEY,
        btcWallet: wallet,
      }),
    ).rejects.toThrow(/depositor payout: input 1 must spend/);
  });

  it("rejects nopayout PSBT when input 0 does not reference the graph assert tx", async () => {
    const wallet = createMockWallet({ supportsBatch: true });
    const { graph, peginTxHex } = setupValidGraph([CHALLENGER_A]);

    const npHex = nopayoutTxId(CHALLENGER_A);
    const np = txStore.get(npHex)!;
    const ATTACKER_ASSERT_HEX = "bb".repeat(32);
    np.ins[0].hash = txidToHashBuffer(ATTACKER_ASSERT_HEX);
    registerTx(ATTACKER_ASSERT_HEX, {
      ins: [],
      outs: [{ script: hexToBytes(ASSERT_SCRIPT_HEX), value: ASSERT_VALUE }],
    });

    await expect(
      signDepositorGraph({
        depositorGraph: graph,
        peginTxHex,
        depositorBtcPubkey: DEPOSITOR_PUBKEY,
        btcWallet: wallet,
      }),
    ).rejects.toThrow(/nopayout .*: input 0 must spend/);
  });

  it("strips 0x prefix from depositor pubkey", async () => {
    const wallet = createMockWallet({ supportsBatch: true });
    const { graph, peginTxHex } = setupValidGraph([CHALLENGER_A]);

    const result = await signDepositorGraph({
      depositorGraph: graph,
      peginTxHex,
      depositorBtcPubkey: `0x${DEPOSITOR_PUBKEY}`,
      btcWallet: wallet,
    });

    expect(result.payout_signatures.payout_signature).toBeDefined();
  });
});
