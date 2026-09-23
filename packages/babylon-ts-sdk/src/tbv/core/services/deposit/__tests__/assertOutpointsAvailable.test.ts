/**
 * Tests for the outpoint-keyed availability check.
 */

import { Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getOutspend, getUtxoInfo } from "../../../clients/mempool";
import {
  InputPrevoutMismatchError,
  UtxoNotAvailableError,
} from "../../../utils";
import { assertOutpointsAvailable } from "../assertOutpointsAvailable";

vi.mock("../../../clients/mempool", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../clients/mempool")>()),
  getOutspend: vi.fn(),
  getUtxoInfo: vi.fn(),
}));

const mockedGetOutspend = vi.mocked(getOutspend);
const mockedGetUtxoInfo = vi.mocked(getUtxoInfo);

const API_URL = "https://mempool.test/api";
const TXID_A = "a".repeat(64);
const TXID_B = "b".repeat(64);
const SCRIPT_A = "5120" + "aa".repeat(32);
const SCRIPT_B = "5120" + "bb".repeat(32);
/** Every chain output in these tests holds this value unless a test says otherwise. */
const CHAIN_VALUE = 100_000;
const EXISTING = { [`${TXID_A}:0`]: SCRIPT_A, [`${TXID_B}:1`]: SCRIPT_B };

/** Two inputs, A:0 and B:1, one output. */
function twoInputTxHex(): string {
  const tx = new Transaction();
  tx.addInput(Buffer.from(TXID_A, "hex").reverse(), 0);
  tx.addInput(Buffer.from(TXID_B, "hex").reverse(), 1);
  tx.addOutput(Buffer.from("0014" + "11".repeat(20), "hex"), 90_000);
  return tx.toHex();
}

/** A fixed chain: which outpoints are spent, and each existing one's script and value. */
function chainFor(chain: {
  spent?: string[];
  scripts?: Record<string, string>;
  values?: Record<string, number>;
}): void {
  mockedGetOutspend.mockImplementation(async (txid, vout) => ({
    spent: (chain.spent ?? []).includes(`${txid}:${vout}`),
  }));
  mockedGetUtxoInfo.mockImplementation(async (txid, vout) => {
    const script = chain.scripts?.[`${txid}:${vout}`];
    if (script === undefined) {
      throw new Error("Mempool API error (404): Transaction not found");
    }
    return {
      txid,
      vout,
      scriptPubKey: script,
      value: chain.values?.[`${txid}:${vout}`] ?? CHAIN_VALUE,
    };
  });
}

function check(
  expectedPrevouts?: Record<string, { scriptPubKey: string; value: number }>,
) {
  return assertOutpointsAvailable({
    unsignedTxHex: twoInputTxHex(),
    mempoolApiUrl: API_URL,
    expectedPrevouts,
  });
}

describe("assertOutpointsAvailable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves when every input exists and is unspent, asking the chain about each outpoint twice", async () => {
    chainFor({ scripts: EXISTING });

    await expect(check()).resolves.toBeUndefined();

    // The output itself is read for every input even with no prevouts to
    // bind: it is what proves the outpoint exists, which the outspend route
    // alone does not.
    expect(mockedGetOutspend).toHaveBeenCalledWith(TXID_A, 0, API_URL);
    expect(mockedGetOutspend).toHaveBeenCalledWith(TXID_B, 1, API_URL);
    expect(mockedGetUtxoInfo).toHaveBeenCalledWith(TXID_A, 0, API_URL);
    expect(mockedGetUtxoInfo).toHaveBeenCalledWith(TXID_B, 1, API_URL);
  });

  it("propagates an unknown parent transaction as a failed read, never as unspent", async () => {
    chainFor({ scripts: { [`${TXID_A}:0`]: SCRIPT_A } });

    const error = await check().catch((e: unknown) => e);

    expect(error).not.toBeInstanceOf(UtxoNotAvailableError);
    expect((error as Error).message).toBe(
      `Failed to get UTXOs for input ${TXID_B}:1: Mempool API error (404): Transaction not found`,
    );
  });

  it("names exactly the spent inputs, whichever address holds them", async () => {
    chainFor({ spent: [`${TXID_B}:1`], scripts: EXISTING });

    const error = await check().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UtxoNotAvailableError);
    expect((error as UtxoNotAvailableError).missingUtxos).toEqual([
      { txid: TXID_B, vout: 1 },
    ]);
  });

  it("lists every spent input, not only the first", async () => {
    chainFor({ spent: [`${TXID_A}:0`, `${TXID_B}:1`], scripts: EXISTING });

    const error = await check().catch((e: unknown) => e);

    expect((error as UtxoNotAvailableError).missingUtxos).toEqual([
      { txid: TXID_A, vout: 0 },
      { txid: TXID_B, vout: 1 },
    ]);
  });

  it("propagates a failed read instead of treating it as a spend, keeping the cause", async () => {
    chainFor({ scripts: EXISTING });
    const outage = new Error("mempool 502");
    mockedGetOutspend.mockRejectedValue(outage);

    const error = await check().catch((e: unknown) => e);

    expect(error).not.toBeInstanceOf(UtxoNotAvailableError);
    expect((error as Error).message).toMatch(
      /^Failed to get UTXOs for input .*: mempool 502$/,
    );
    expect((error as Error).cause).toBe(outage);
  });

  describe("with the prevouts the transaction was built against", () => {
    const expectedPrevouts = {
      [`${TXID_A}:0`]: { scriptPubKey: SCRIPT_A, value: CHAIN_VALUE },
      [`${TXID_B}:1`]: { scriptPubKey: SCRIPT_B, value: CHAIN_VALUE },
    };

    it("resolves when each outpoint has the script and value it was built with", async () => {
      chainFor({ scripts: EXISTING });

      await expect(check(expectedPrevouts)).resolves.toBeUndefined();
      expect(mockedGetUtxoInfo).toHaveBeenCalledTimes(2);
    });

    it("rejects an outpoint the chain says pays another script — the mislabelled listing entry", async () => {
      // B:1 really belongs to another address; the listing stamped A's
      // script on it. Caught here, before anything is registered.
      chainFor({
        scripts: { [`${TXID_A}:0`]: SCRIPT_A, [`${TXID_B}:1`]: SCRIPT_A },
      });

      const error = await check(expectedPrevouts).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(InputPrevoutMismatchError);
      expect((error as InputPrevoutMismatchError).vout).toBe(1);
      expect((error as InputPrevoutMismatchError).chain.scriptPubKey).toBe(
        SCRIPT_A,
      );
    });

    it("rejects an outpoint whose chain value differs from the one it was built with", async () => {
      chainFor({
        scripts: EXISTING,
        values: { [`${TXID_B}:1`]: CHAIN_VALUE - 1 },
      });

      const error = await check(expectedPrevouts).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(InputPrevoutMismatchError);
      expect((error as InputPrevoutMismatchError).expected.value).toBe(
        CHAIN_VALUE,
      );
      expect((error as InputPrevoutMismatchError).chain.value).toBe(
        CHAIN_VALUE - 1,
      );
    });

    it("reports a prevout mismatch ahead of a spend — a build fault before a race", async () => {
      chainFor({
        spent: [`${TXID_A}:0`],
        scripts: { [`${TXID_A}:0`]: SCRIPT_A, [`${TXID_B}:1`]: SCRIPT_A },
      });

      await expect(check(expectedPrevouts)).rejects.toBeInstanceOf(
        InputPrevoutMismatchError,
      );
    });

    it("compares scripts case-insensitively", async () => {
      chainFor({
        scripts: {
          [`${TXID_A}:0`]: SCRIPT_A.toUpperCase(),
          [`${TXID_B}:1`]: SCRIPT_B,
        },
      });

      await expect(check(expectedPrevouts)).resolves.toBeUndefined();
    });

    it("rejects an input the transaction was not built from, before any read", async () => {
      chainFor({ scripts: EXISTING });

      await expect(
        check({
          [`${TXID_A}:0`]: { scriptPubKey: SCRIPT_A, value: CHAIN_VALUE },
        }),
      ).rejects.toThrow(`Input ${TXID_B}:1 has no expected prevout`);
      expect(mockedGetOutspend).not.toHaveBeenCalled();
    });
  });

  it("rejects a transaction that references one outpoint twice, before any read", async () => {
    chainFor({ scripts: EXISTING });
    const tx = new Transaction();
    tx.addInput(Buffer.from(TXID_A, "hex").reverse(), 0);
    tx.addInput(Buffer.from(TXID_A, "hex").reverse(), 0);
    tx.addOutput(Buffer.from("0014" + "11".repeat(20), "hex"), 90_000);

    await expect(
      assertOutpointsAvailable({
        unsignedTxHex: tx.toHex(),
        mempoolApiUrl: API_URL,
      }),
    ).rejects.toThrow(/duplicate input/);
    expect(mockedGetOutspend).not.toHaveBeenCalled();
  });
});
