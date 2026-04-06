import { describe, expect, it, vi } from "vitest";

import { broadcastPrePeginTransaction } from "../vaultPeginBroadcastService";

// --- Mocks ---

vi.mock("@babylonlabs-io/ts-sdk", () => ({
  pushTx: vi.fn().mockResolvedValue("mock-txid"),
}));

vi.mock("../../../clients/btc/config", () => ({
  getMempoolApiUrl: vi.fn(() => "https://mempool.test/api"),
}));

const mockFetchUTXOFromMempool = vi.fn().mockResolvedValue({
  scriptPubKey: "0014" + "cc".repeat(20),
  value: 100_000,
});

vi.mock("../vaultUtxoDerivationService", () => ({
  fetchUTXOFromMempool: (...args: unknown[]) =>
    mockFetchUTXOFromMempool(...args),
}));

vi.mock("../../../utils/btc", () => ({
  getPsbtInputFields: vi.fn(
    ({ value, scriptPubKey }: { value: number; scriptPubKey: string }) => ({
      witnessUtxo: {
        script: Buffer.from(scriptPubKey, "hex"),
        value: typeof value === "bigint" ? Number(value) : value,
      },
    }),
  ),
}));

// --- Helpers ---

/**
 * Hand-crafted minimal Bitcoin transaction hex.
 *
 * The broadcast service parses this with Transaction.fromHex and extracts
 * input txid by reversing the 32-byte hash field. We construct the raw
 * bytes directly to avoid bitcoinjs-lib Buffer polyfill issues in jsdom.
 *
 * Layout (legacy, no witness):
 *   version (4 LE) + input_count (varint) + input + output_count (varint) + output + locktime (4 LE)
 *
 * Input: hash (32 bytes, internal/reversed order) + vout (4 LE) + scriptSig len (varint 0) + sequence (4 LE)
 * Output: value (8 LE) + scriptPubKey len (varint) + scriptPubKey
 */

/** The txid as it would appear in display / RPC order */
const INPUT_TXID =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const INPUT_VOUT = 0;

/** Reversed bytes (internal byte order stored in the raw tx) */
const INPUT_HASH_INTERNAL = INPUT_TXID.split("")
  .reduce<string[]>((acc, _, i, arr) => {
    if (i % 2 === 0) acc.push(arr[i] + arr[i + 1]);
    return acc;
  }, [])
  .reverse()
  .join("");

const MOCK_TX_HEX = [
  "02000000", // version 2
  "01", // 1 input
  INPUT_HASH_INTERNAL, // prev tx hash (internal order)
  "00000000", // vout 0
  "00", // scriptSig length 0 (unsigned)
  "ffffffff", // sequence
  "01", // 1 output
  "a086010000000000", // value 100000 LE
  "16", // scriptPubKey length 22
  "0014" + "bb".repeat(20), // P2WPKH scriptPubKey
  "00000000", // locktime
].join("");

function makeParams(
  localPrevouts?: Record<string, { scriptPubKey: string; value: number }>,
) {
  return {
    unsignedTxHex: MOCK_TX_HEX,
    btcWalletProvider: {
      signPsbt: vi
        .fn()
        .mockImplementation((hex: string) => Promise.resolve(hex)),
    },
    depositorBtcPubkey: "aa".repeat(32),
    ...(localPrevouts !== undefined ? { localPrevouts } : {}),
  };
}

// --- Tests ---

describe("broadcastPrePeginTransaction localPrevouts", () => {
  it("uses localPrevouts instead of mempool when provided", async () => {
    const key = `${INPUT_TXID}:${INPUT_VOUT}`;
    const localPrevouts = {
      [key]: { scriptPubKey: "0014" + "cc".repeat(20), value: 100_000 },
    };

    mockFetchUTXOFromMempool.mockClear();

    try {
      await broadcastPrePeginTransaction(makeParams(localPrevouts));
    } catch {
      // Signing/finalization may fail with mock data -- expected
    }

    expect(mockFetchUTXOFromMempool).not.toHaveBeenCalled();
  });

  it("falls back to mempool when localPrevouts not provided", async () => {
    mockFetchUTXOFromMempool.mockClear();

    try {
      await broadcastPrePeginTransaction(makeParams());
    } catch {
      // Signing/finalization may fail with mock data -- expected
    }

    expect(mockFetchUTXOFromMempool).toHaveBeenCalled();
  });

  it("falls back to mempool for inputs not in localPrevouts", async () => {
    const nonMatchingKey =
      "0000000000000000000000000000000000000000000000000000000000000000:99";
    const localPrevouts = {
      [nonMatchingKey]: {
        scriptPubKey: "0014" + "cc".repeat(20),
        value: 50_000,
      },
    };

    mockFetchUTXOFromMempool.mockClear();

    try {
      await broadcastPrePeginTransaction(makeParams(localPrevouts));
    } catch {
      // Signing/finalization may fail with mock data -- expected
    }

    expect(mockFetchUTXOFromMempool).toHaveBeenCalled();
  });
});
