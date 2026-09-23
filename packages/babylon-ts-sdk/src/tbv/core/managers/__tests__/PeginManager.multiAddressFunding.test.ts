/**
 * Tests for signing a Pre-PegIn funded from more than one of the wallet's
 * addresses: each input must be stamped with the key that owns it, and every
 * declared prevout must be pinned to its outpoint against the chain.
 */

import { payments, Psbt, Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { zeroAddress, type Address, type Chain, type PublicClient } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MockBitcoinWallet, MockEthereumWallet } from "../../../../testing";
import { MEMPOOL_API_URLS } from "../../clients/mempool";
import { TEST_KEYS } from "../../primitives/psbt/__tests__/helpers";
import type { FundingPrevout } from "../../utils";
import { PeginManager } from "../PeginManager";

// Real verification needs real signatures; the mock wallet cannot produce
// them. Covered in primitives/psbt/__tests__/verifyKeyPathSchnorrSignature.test.ts.
vi.mock("../../primitives/psbt/verifyKeyPathSchnorrSignature", () => ({
  assertReturnedKeyPathSignatures: vi.fn(() => 2),
}));

const { getUtxoInfoMock, pushTxMock } = vi.hoisted(() => ({
  getUtxoInfoMock: vi.fn(),
  pushTxMock: vi.fn(),
}));

vi.mock("../../clients/mempool", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../clients/mempool")>();
  return { ...actual, getUtxoInfo: getUtxoInfoMock, pushTx: pushTxMock };
});

// The depositor's connected key (BIP-86 `.../0/0`) and the change-branch key
// (`.../1/0`). Different keys, so different scripts.
const RECEIVE_KEY = TEST_KEYS.DEPOSITOR;
const CHANGE_KEY =
  "c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";

function p2trScript(internalPubkeyHex: string): string {
  const { output } = payments.p2tr({
    internalPubkey: Buffer.from(internalPubkeyHex, "hex"),
  });
  if (!output) throw new Error("test fixture: p2tr produced no output");
  return output.toString("hex");
}

const RECEIVE_SCRIPT = p2trScript(RECEIVE_KEY);
const CHANGE_SCRIPT = p2trScript(CHANGE_KEY);

const RECEIVE_TXID =
  "0000000000000000000000000000000000000000000000000000000000000001";
const CHANGE_TXID =
  "0000000000000000000000000000000000000000000000000000000000000002";

const RECEIVE_VALUE = 800_000;
const CHANGE_VALUE = 200_000;
const OUTPUT_VALUE = 995_000;
const BROADCAST_TXID = "f".repeat(64);

/**
 * A Pre-PegIn-shaped funded transaction: one input on the receive branch, one
 * on the change branch, and a single output that leaves a plausible fee.
 */
function fundedTxHex(): string {
  const tx = new Transaction();
  tx.version = 2;
  tx.addInput(Buffer.from(RECEIVE_TXID, "hex").reverse(), 0);
  tx.addInput(Buffer.from(CHANGE_TXID, "hex").reverse(), 0);
  tx.addOutput(Buffer.from(RECEIVE_SCRIPT, "hex"), OUTPUT_VALUE);
  return tx.toHex();
}

function localPrevouts(): Record<string, FundingPrevout> {
  return {
    [`${RECEIVE_TXID}:0`]: {
      scriptPubKey: RECEIVE_SCRIPT,
      value: RECEIVE_VALUE,
      internalPubkeyHex: RECEIVE_KEY,
    },
    [`${CHANGE_TXID}:0`]: {
      scriptPubKey: CHANGE_SCRIPT,
      value: CHANGE_VALUE,
      internalPubkeyHex: CHANGE_KEY,
    },
  };
}

/** A signPsbt that records the request and returns it with every input finalized. */
function makeSigningWallet(): {
  wallet: MockBitcoinWallet;
  requestedPsbts: string[];
} {
  const wallet = new MockBitcoinWallet({ publicKeyHex: RECEIVE_KEY });
  const requestedPsbts: string[] = [];
  vi.spyOn(wallet, "signPsbt").mockImplementation(async (psbtHex: string) => {
    requestedPsbts.push(psbtHex);
    const psbt = Psbt.fromHex(psbtHex);
    // One 65-byte witness item: [count][length][bytes].
    const witness = Buffer.concat([
      Buffer.from([0x01, 0x41]),
      Buffer.alloc(65, 0x11),
    ]);
    for (let i = 0; i < psbt.data.inputs.length; i++) {
      psbt.updateInput(i, { finalScriptWitness: witness });
    }
    return psbt.toHex();
  });
  return { wallet, requestedPsbts };
}

function makeManager(btcWallet: MockBitcoinWallet): PeginManager {
  const publicClient = {
    readContract: vi.fn().mockResolvedValue({ depositor: zeroAddress }),
  } as unknown as PublicClient;
  const ethChain: Chain = {
    id: 11155111,
    name: "Sepolia",
    nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: ["https://rpc.sepolia.org"] } },
  };
  return new PeginManager({
    btcNetwork: "signet",
    btcWallet,
    ethWallet: new MockEthereumWallet() as never,
    ethChain,
    publicClient,
    vaultContracts: {
      btcVaultRegistry: "0x742d35cc6634c0532925a3b844bc9e7595f0beb0" as Address,
    },
    mempoolApiUrl: MEMPOOL_API_URLS.signet,
  });
}

beforeEach(() => {
  pushTxMock.mockResolvedValue(BROADCAST_TXID);
  getUtxoInfoMock.mockImplementation(async (txid: string, vout: number) => {
    if (txid === RECEIVE_TXID)
      return {
        txid,
        vout,
        value: RECEIVE_VALUE,
        scriptPubKey: RECEIVE_SCRIPT,
      };
    if (txid === CHANGE_TXID)
      return { txid, vout, value: CHANGE_VALUE, scriptPubKey: CHANGE_SCRIPT };
    throw new Error(`unexpected outpoint ${txid}:${vout}`);
  });
});

describe("signAndBroadcast with multi-address funding", () => {
  it("stamps each input with the key that owns its script", async () => {
    const { wallet, requestedPsbts } = makeSigningWallet();

    const txid = await makeManager(wallet).signAndBroadcast({
      fundedPrePeginTxHex: fundedTxHex(),
      depositorBtcPubkey: RECEIVE_KEY,
      localPrevouts: localPrevouts(),
    });

    expect(txid).toBe(BROADCAST_TXID);
    const requested = Psbt.fromHex(requestedPsbts[0]);
    expect(requested.data.inputs[0].tapInternalKey?.toString("hex")).toBe(
      RECEIVE_KEY,
    );
    expect(requested.data.inputs[1].tapInternalKey?.toString("hex")).toBe(
      CHANGE_KEY,
    );
    expect(requested.data.inputs[1].witnessUtxo?.script.toString("hex")).toBe(
      CHANGE_SCRIPT,
    );
  });

  it("rejects a change-branch outpoint labelled with the depositor's key and script", async () => {
    const { wallet } = makeSigningWallet();
    const prevouts = localPrevouts();
    // Internally consistent — the key does own this script — but it is the
    // wrong outpoint's script. Only the chain read catches it.
    prevouts[`${CHANGE_TXID}:0`] = {
      scriptPubKey: RECEIVE_SCRIPT,
      value: CHANGE_VALUE,
      internalPubkeyHex: RECEIVE_KEY,
    };

    await expect(
      makeManager(wallet).signAndBroadcast({
        fundedPrePeginTxHex: fundedTxHex(),
        depositorBtcPubkey: RECEIVE_KEY,
        localPrevouts: prevouts,
      }),
    ).rejects.toThrow(/does not match the chain/);

    expect(wallet.signPsbt).not.toHaveBeenCalled();
    expect(pushTxMock).not.toHaveBeenCalled();
  });

  it("rejects a key that does not own the script it is declared with", async () => {
    const { wallet } = makeSigningWallet();
    const prevouts = localPrevouts();
    prevouts[`${CHANGE_TXID}:0`] = {
      scriptPubKey: CHANGE_SCRIPT,
      value: CHANGE_VALUE,
      internalPubkeyHex: RECEIVE_KEY,
    };

    await expect(
      makeManager(wallet).signAndBroadcast({
        fundedPrePeginTxHex: fundedTxHex(),
        depositorBtcPubkey: RECEIVE_KEY,
        localPrevouts: prevouts,
      }),
    ).rejects.toThrow(/key does not own its script/);

    expect(wallet.signPsbt).not.toHaveBeenCalled();
    // The local check costs no network round trip, so the bad input is
    // rejected before its outpoint is ever read.
    expect(getUtxoInfoMock).not.toHaveBeenCalledWith(
      CHANGE_TXID,
      0,
      expect.anything(),
    );
  });

  it("refuses to sign an input that declares no owning key once another input does", async () => {
    const { wallet } = makeSigningWallet();
    const prevouts = localPrevouts();
    prevouts[`${RECEIVE_TXID}:0`] = {
      scriptPubKey: RECEIVE_SCRIPT,
      value: RECEIVE_VALUE,
    };

    await expect(
      makeManager(wallet).signAndBroadcast({
        fundedPrePeginTxHex: fundedTxHex(),
        depositorBtcPubkey: RECEIVE_KEY,
        localPrevouts: prevouts,
      }),
    ).rejects.toThrow(/carries no internalPubkeyHex/);

    expect(wallet.signPsbt).not.toHaveBeenCalled();
  });

  it("refuses to sign when an input has no declared prevout at all", async () => {
    const { wallet } = makeSigningWallet();
    const prevouts = localPrevouts();
    delete prevouts[`${CHANGE_TXID}:0`];

    await expect(
      makeManager(wallet).signAndBroadcast({
        fundedPrePeginTxHex: fundedTxHex(),
        depositorBtcPubkey: RECEIVE_KEY,
        localPrevouts: prevouts,
      }),
    ).rejects.toThrow(`No funding prevout declared for ${CHANGE_TXID}:0`);

    expect(wallet.signPsbt).not.toHaveBeenCalled();
  });

  it("keeps the single-address path on the declared prevouts, with the depositor key on every input", async () => {
    const { wallet, requestedPsbts } = makeSigningWallet();

    const txid = await makeManager(wallet).signAndBroadcast({
      fundedPrePeginTxHex: fundedTxHex(),
      depositorBtcPubkey: RECEIVE_KEY,
      localPrevouts: {
        [`${RECEIVE_TXID}:0`]: {
          scriptPubKey: RECEIVE_SCRIPT,
          value: RECEIVE_VALUE,
        },
        [`${CHANGE_TXID}:0`]: {
          scriptPubKey: RECEIVE_SCRIPT,
          value: CHANGE_VALUE,
        },
      },
    });

    expect(txid).toBe(BROADCAST_TXID);
    expect(getUtxoInfoMock).not.toHaveBeenCalled();
    const requested = Psbt.fromHex(requestedPsbts[0]);
    for (const input of requested.data.inputs) {
      expect(input.tapInternalKey?.toString("hex")).toBe(RECEIVE_KEY);
    }
  });
});
