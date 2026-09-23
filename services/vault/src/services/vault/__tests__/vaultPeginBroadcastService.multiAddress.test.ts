// @vitest-environment node
// The curve library needs Node's typed arrays; taproot script derivation here
// would fail `initEccLib`'s self-check under jsdom.

/**
 * Broadcasting a Pre-PegIn funded from two of the wallet's addresses.
 *
 * Unlike the sibling suite, this one uses the real bitcoinjs-lib so the PSBT
 * handed to the wallet can be inspected: the point of the change is which
 * internal key lands on which input.
 */

import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { initEccLib, payments, Psbt, Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { mockFetchUTXO, mockPushTx } = vi.hoisted(() => ({
  mockFetchUTXO: vi.fn(),
  mockPushTx: vi.fn(),
}));

vi.mock("@babylonlabs-io/ts-sdk", () => ({
  pushTx: mockPushTx,
  HEX_RE: /^[0-9a-fA-F]+$/,
  TXID_RE: /^[0-9a-fA-F]{64}$/,
  MAX_REASONABLE_FEE_SATS: 1_000_000n,
}));
vi.mock(
  "@babylonlabs-io/ts-sdk/tbv/core/primitives",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@babylonlabs-io/ts-sdk/tbv/core/primitives")
      >();
    return {
      ...actual,
      // Real Schnorr verification needs real signatures; the fake witness
      // below is not one. Covered by the SDK's own verifier tests.
      assertReturnedKeyPathSignatures: vi.fn(() => 2),
    };
  },
);
vi.mock("../../../clients/btc/config", () => ({
  getMempoolApiUrl: vi.fn(() => "https://mempool.test"),
}));
vi.mock("../vaultUtxoDerivationService", () => ({
  fetchUTXOFromMempool: mockFetchUTXO,
}));

import {
  broadcastPrePeginTransaction,
  utxosToExpectedRecord,
} from "../vaultPeginBroadcastService";

// BIP-340 test keys standing in for the BIP-86 receive (`.../0/0`) and change
// (`.../1/0`) branches: different keys, hence different scripts.
const RECEIVE_KEY =
  "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const CHANGE_KEY =
  "c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";

const RECEIVE_TXID =
  "0000000000000000000000000000000000000000000000000000000000000001";
const CHANGE_TXID =
  "0000000000000000000000000000000000000000000000000000000000000002";
const RECEIVE_VALUE = 800_000;
const CHANGE_VALUE = 200_000;
const BROADCAST_TXID = "f".repeat(64);

// Taproot needs the curve; match the application's main.tsx setup.
let RECEIVE_SCRIPT: string;
let CHANGE_SCRIPT: string;

function p2trScript(internalPubkeyHex: string): string {
  const { output } = payments.p2tr({
    internalPubkey: Buffer.from(internalPubkeyHex, "hex"),
  });
  if (!output) throw new Error("test fixture: p2tr produced no output");
  return output.toString("hex");
}

function unsignedTxHex(): string {
  const tx = new Transaction();
  tx.version = 2;
  tx.addInput(Buffer.from(RECEIVE_TXID, "hex").reverse(), 0);
  tx.addInput(Buffer.from(CHANGE_TXID, "hex").reverse(), 0);
  tx.addOutput(Buffer.from(RECEIVE_SCRIPT, "hex"), 995_000);
  return tx.toHex();
}

function multiAddressUtxos(): Array<{
  txid: string;
  vout: number;
  value: number;
  scriptPubKey: string;
  internalPubkeyHex?: string;
}> {
  return [
    {
      txid: RECEIVE_TXID,
      vout: 0,
      value: RECEIVE_VALUE,
      scriptPubKey: RECEIVE_SCRIPT,
      internalPubkeyHex: RECEIVE_KEY,
    },
    {
      txid: CHANGE_TXID,
      vout: 0,
      value: CHANGE_VALUE,
      scriptPubKey: CHANGE_SCRIPT,
      internalPubkeyHex: CHANGE_KEY,
    },
  ];
}

/** A wallet that records the PSBT it was asked to sign and finalizes it. */
function makeWallet(): {
  wallet: { signPsbt: (psbtHex: string) => Promise<string> };
  requestedPsbts: string[];
} {
  const requestedPsbts: string[] = [];
  // One 65-byte witness item: [count][length][bytes].
  const witness = Buffer.concat([
    Buffer.from([0x01, 0x41]),
    Buffer.alloc(65, 0x11),
  ]);
  return {
    requestedPsbts,
    // No `approveDepositTerms`, so the approval ceremony is skipped.
    wallet: {
      signPsbt: async (psbtHex: string) => {
        requestedPsbts.push(psbtHex);
        const psbt = Psbt.fromHex(psbtHex);
        for (let i = 0; i < psbt.data.inputs.length; i++) {
          psbt.updateInput(i, { finalScriptWitness: witness });
        }
        return psbt.toHex();
      },
    },
  };
}

beforeAll(() => {
  initEccLib(ecc);
  RECEIVE_SCRIPT = p2trScript(RECEIVE_KEY);
  CHANGE_SCRIPT = p2trScript(CHANGE_KEY);
});

beforeEach(() => {
  // Call counts are assertions here, so each test starts from zero.
  mockPushTx.mockClear();
  mockFetchUTXO.mockClear();
  mockPushTx.mockResolvedValue(BROADCAST_TXID);
  mockFetchUTXO.mockImplementation(async (txid: string) => {
    if (txid === RECEIVE_TXID)
      return { scriptPubKey: RECEIVE_SCRIPT, value: RECEIVE_VALUE };
    if (txid === CHANGE_TXID)
      return { scriptPubKey: CHANGE_SCRIPT, value: CHANGE_VALUE };
    throw new Error(`unexpected outpoint ${txid}`);
  });
});

describe("utxosToExpectedRecord with multi-address funding", () => {
  it("carries each UTXO's owning key into the record", () => {
    const record = utxosToExpectedRecord(multiAddressUtxos());

    expect(record[`${CHANGE_TXID}:0`]).toEqual({
      scriptPubKey: CHANGE_SCRIPT,
      value: CHANGE_VALUE,
      internalPubkeyHex: CHANGE_KEY,
    });
  });

  it("rejects a malformed owning key at the record boundary", () => {
    const [receive, change] = multiAddressUtxos();

    expect(() =>
      utxosToExpectedRecord([
        receive,
        { ...change, internalPubkeyHex: `0x${CHANGE_KEY}` },
      ]),
    ).toThrow(`Invalid UTXO internalPubkeyHex for ${CHANGE_TXID}:0`);
  });
});

describe("broadcastPrePeginTransaction with multi-address funding", () => {
  it("stamps each input with the key that owns its script", async () => {
    const { wallet, requestedPsbts } = makeWallet();

    const txid = await broadcastPrePeginTransaction({
      unsignedTxHex: unsignedTxHex(),
      btcWalletProvider: wallet,
      depositorBtcPubkey: RECEIVE_KEY,
      expectedUtxos: utxosToExpectedRecord(multiAddressUtxos()),
    });

    expect(txid).toBe(BROADCAST_TXID);
    const requested = Psbt.fromHex(requestedPsbts[0]);
    expect(requested.data.inputs[0].tapInternalKey?.toString("hex")).toBe(
      RECEIVE_KEY,
    );
    expect(requested.data.inputs[1].tapInternalKey?.toString("hex")).toBe(
      CHANGE_KEY,
    );
  });

  it("rejects a change-branch outpoint labelled with the depositor's key and script", async () => {
    const { wallet, requestedPsbts } = makeWallet();
    const [receive, change] = multiAddressUtxos();
    const expectedUtxos = utxosToExpectedRecord([
      receive,
      {
        ...change,
        scriptPubKey: RECEIVE_SCRIPT,
        internalPubkeyHex: RECEIVE_KEY,
      },
    ]);

    await expect(
      broadcastPrePeginTransaction({
        unsignedTxHex: unsignedTxHex(),
        btcWalletProvider: wallet,
        depositorBtcPubkey: RECEIVE_KEY,
        expectedUtxos,
      }),
    ).rejects.toThrow(/script does not match the chain/);

    expect(requestedPsbts).toHaveLength(0);
    expect(mockPushTx).not.toHaveBeenCalled();
  });

  it("refuses to sign an input that declares no owning key once another input does", async () => {
    const { wallet, requestedPsbts } = makeWallet();
    const [receive, change] = multiAddressUtxos();
    const expectedUtxos = utxosToExpectedRecord([
      { ...receive, internalPubkeyHex: undefined },
      change,
    ]);

    await expect(
      broadcastPrePeginTransaction({
        unsignedTxHex: unsignedTxHex(),
        btcWalletProvider: wallet,
        depositorBtcPubkey: RECEIVE_KEY,
        expectedUtxos,
      }),
    ).rejects.toThrow(/carries no internalPubkeyHex/);

    expect(requestedPsbts).toHaveLength(0);
  });

  it("keeps the single-address path on the declared prevouts, with the depositor key on every input", async () => {
    const { wallet, requestedPsbts } = makeWallet();
    const [receive, change] = multiAddressUtxos();
    const expectedUtxos = utxosToExpectedRecord([
      { ...receive, internalPubkeyHex: undefined },
      {
        ...change,
        scriptPubKey: RECEIVE_SCRIPT,
        internalPubkeyHex: undefined,
      },
    ]);

    const txid = await broadcastPrePeginTransaction({
      unsignedTxHex: unsignedTxHex(),
      btcWalletProvider: wallet,
      depositorBtcPubkey: RECEIVE_KEY,
      expectedUtxos,
    });

    expect(txid).toBe(BROADCAST_TXID);
    expect(mockFetchUTXO).not.toHaveBeenCalled();
    const requested = Psbt.fromHex(requestedPsbts[0]);
    for (const input of requested.data.inputs) {
      expect(input.tapInternalKey?.toString("hex")).toBe(RECEIVE_KEY);
    }
  });
});
