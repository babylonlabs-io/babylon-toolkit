/**
 * Tests for the outpoint-keyed availability check.
 */

import { Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { describe, expect, it, vi } from "vitest";

import { UtxoNotAvailableError } from "../../../utils";
import {
  assertOutpointsAvailable,
  InputPrevoutMismatchError,
  type OutpointReaders,
} from "../assertOutpointsAvailable";

const TXID_A = "a".repeat(64);
const TXID_B = "b".repeat(64);
const SCRIPT_A = "5120" + "aa".repeat(32);
const SCRIPT_B = "5120" + "bb".repeat(32);

/** Two inputs, A:0 and B:1, one output. */
function twoInputTxHex(): string {
  const tx = new Transaction();
  tx.addInput(Buffer.from(TXID_A, "hex").reverse(), 0);
  tx.addInput(Buffer.from(TXID_B, "hex").reverse(), 1);
  tx.addOutput(Buffer.from("0014" + "11".repeat(20), "hex"), 90_000);
  return tx.toHex();
}

/** Every chain output in these tests holds this value unless a test says otherwise. */
const CHAIN_VALUE = 100_000;

/** Readers over a fixed chain: which outpoints are spent, and each one's script and value. */
function readersFor(chain: {
  spent?: string[];
  scripts?: Record<string, string>;
  values?: Record<string, number>;
}): OutpointReaders & {
  readOutspend: ReturnType<typeof vi.fn>;
  readOutpoint: ReturnType<typeof vi.fn>;
} {
  return {
    readOutspend: vi.fn(async (txid: string, vout: number) => ({
      spent: (chain.spent ?? []).includes(`${txid}:${vout}`),
    })),
    readOutpoint: vi.fn(async (txid: string, vout: number) => {
      const script = chain.scripts?.[`${txid}:${vout}`];
      if (script === undefined)
        throw new Error(`no such outpoint ${txid}:${vout}`);
      return {
        scriptPubKey: script,
        value: chain.values?.[`${txid}:${vout}`] ?? CHAIN_VALUE,
      };
    }),
  };
}

describe("assertOutpointsAvailable", () => {
  it("resolves when every input exists and is unspent, asking the chain about each outpoint twice", async () => {
    const readers = readersFor({
      scripts: { [`${TXID_A}:0`]: SCRIPT_A, [`${TXID_B}:1`]: SCRIPT_B },
    });

    await expect(
      assertOutpointsAvailable({ unsignedTxHex: twoInputTxHex(), readers }),
    ).resolves.toBeUndefined();

    expect(readers.readOutspend).toHaveBeenCalledWith(TXID_A, 0);
    expect(readers.readOutspend).toHaveBeenCalledWith(TXID_B, 1);
    // The output itself is read for every input even with no scripts to
    // bind: it is what proves the outpoint exists, which the outspend route
    // alone cannot (an unknown parent answers `{spent: false}` there).
    expect(readers.readOutpoint).toHaveBeenCalledWith(TXID_A, 0);
    expect(readers.readOutpoint).toHaveBeenCalledWith(TXID_B, 1);
  });

  it("propagates an unknown parent transaction as a failed read, never as unspent", async () => {
    // B's parent is not in the index: outspend says {spent:false}, the
    // output read throws. The old address listing reported such an input
    // missing; this must not silently pass it.
    const readers = readersFor({ scripts: { [`${TXID_A}:0`]: SCRIPT_A } });

    await expect(
      assertOutpointsAvailable({ unsignedTxHex: twoInputTxHex(), readers }),
    ).rejects.toThrow(`no such outpoint ${TXID_B}:1`);
  });

  /** Both outputs exist on chain, with their own scripts. */
  const EXISTING = { [`${TXID_A}:0`]: SCRIPT_A, [`${TXID_B}:1`]: SCRIPT_B };

  it("names exactly the spent inputs, whichever address holds them", async () => {
    const readers = readersFor({ spent: [`${TXID_B}:1`], scripts: EXISTING });

    const error = await assertOutpointsAvailable({
      unsignedTxHex: twoInputTxHex(),
      readers,
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UtxoNotAvailableError);
    expect((error as UtxoNotAvailableError).missingUtxos).toEqual([
      { txid: TXID_B, vout: 1 },
    ]);
  });

  it("lists every spent input, not only the first", async () => {
    const readers = readersFor({
      spent: [`${TXID_A}:0`, `${TXID_B}:1`],
      scripts: EXISTING,
    });

    const error = await assertOutpointsAvailable({
      unsignedTxHex: twoInputTxHex(),
      readers,
    }).catch((e: unknown) => e);

    expect((error as UtxoNotAvailableError).missingUtxos).toHaveLength(2);
  });

  it("refuses an unreadable spend status instead of treating it as unspent", async () => {
    // A body without a boolean `spent` is not evidence either way. Passing
    // it as "unspent" would let a deposit be registered against an input the
    // check could not vouch for — and the mempool reader casts the body
    // without validating it, so this is the only gate.
    for (const body of [{}, { spent: "true" }, { spent: 1 }]) {
      const readers = readersFor({ scripts: EXISTING });
      // Deliberately not the reader's declared shape: that is the point.
      readers.readOutspend.mockResolvedValue(
        body as unknown as { spent: boolean },
      );

      const error = await assertOutpointsAvailable({
        unsignedTxHex: twoInputTxHex(),
        readers,
      }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(UtxoNotAvailableError);
      expect((error as Error).message).toMatch(/unreadable spend status/);
    }
  });

  it("propagates a failed read instead of treating it as a spend", async () => {
    // A network fault is not evidence that the input is gone; callers treat
    // the two differently (one is terminal for the deposit, one is a retry).
    const readers = readersFor({ scripts: EXISTING });
    readers.readOutspend.mockRejectedValueOnce(new Error("mempool 502"));

    await expect(
      assertOutpointsAvailable({ unsignedTxHex: twoInputTxHex(), readers }),
    ).rejects.toThrow("mempool 502");
  });

  describe("with the prevouts the transaction was built against", () => {
    const expectedPrevouts = {
      [`${TXID_A}:0`]: { scriptPubKey: SCRIPT_A, value: CHAIN_VALUE },
      [`${TXID_B}:1`]: { scriptPubKey: SCRIPT_B, value: CHAIN_VALUE },
    };

    it("resolves when each outpoint pays the script it was built as paying", async () => {
      const readers = readersFor({
        scripts: { [`${TXID_A}:0`]: SCRIPT_A, [`${TXID_B}:1`]: SCRIPT_B },
      });

      await expect(
        assertOutpointsAvailable({
          unsignedTxHex: twoInputTxHex(),
          readers,
          expectedPrevouts,
        }),
      ).resolves.toBeUndefined();
      expect(readers.readOutpoint).toHaveBeenCalledTimes(2);
    });

    it("rejects an outpoint the chain says pays another script — the mislabelled listing entry", async () => {
      // B:1 really belongs to another address; the listing stamped A's
      // script on it. Caught here, before anything is registered.
      const readers = readersFor({
        scripts: { [`${TXID_A}:0`]: SCRIPT_A, [`${TXID_B}:1`]: SCRIPT_A },
      });

      const error = await assertOutpointsAvailable({
        unsignedTxHex: twoInputTxHex(),
        readers,
        expectedPrevouts,
      }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(InputPrevoutMismatchError);
      expect((error as InputPrevoutMismatchError).vout).toBe(1);
      expect((error as InputPrevoutMismatchError).chain.scriptPubKey).toBe(
        SCRIPT_A,
      );
    });

    it("rejects an outpoint whose chain value differs from the one it was built with", async () => {
      // Same script, different amount: a listing that misreports the value
      // would otherwise register a deposit the signing site later refuses.
      const readers = readersFor({
        scripts: { [`${TXID_A}:0`]: SCRIPT_A, [`${TXID_B}:1`]: SCRIPT_B },
        values: { [`${TXID_B}:1`]: CHAIN_VALUE - 1 },
      });

      const error = await assertOutpointsAvailable({
        unsignedTxHex: twoInputTxHex(),
        readers,
        expectedPrevouts,
      }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(InputPrevoutMismatchError);
      expect((error as InputPrevoutMismatchError).vout).toBe(1);
      expect((error as InputPrevoutMismatchError).expected.value).toBe(
        CHAIN_VALUE,
      );
      expect((error as InputPrevoutMismatchError).chain.value).toBe(
        CHAIN_VALUE - 1,
      );
    });

    it("reports a script mismatch ahead of a spend — a build fault before a race", async () => {
      const readers = readersFor({
        spent: [`${TXID_A}:0`],
        scripts: { [`${TXID_A}:0`]: SCRIPT_A, [`${TXID_B}:1`]: SCRIPT_A },
      });

      await expect(
        assertOutpointsAvailable({
          unsignedTxHex: twoInputTxHex(),
          readers,
          expectedPrevouts,
        }),
      ).rejects.toBeInstanceOf(InputPrevoutMismatchError);
    });

    it("compares scripts case-insensitively", async () => {
      const readers = readersFor({
        scripts: {
          [`${TXID_A}:0`]: SCRIPT_A.toUpperCase(),
          [`${TXID_B}:1`]: SCRIPT_B,
        },
      });

      await expect(
        assertOutpointsAvailable({
          unsignedTxHex: twoInputTxHex(),
          readers,
          expectedPrevouts,
        }),
      ).resolves.toBeUndefined();
    });

    it("rejects an input the transaction was not built from, before any read", async () => {
      const readers = readersFor({ scripts: EXISTING });

      await expect(
        assertOutpointsAvailable({
          unsignedTxHex: twoInputTxHex(),
          readers,
          expectedPrevouts: {
            [`${TXID_A}:0`]: { scriptPubKey: SCRIPT_A, value: CHAIN_VALUE },
          },
        }),
      ).rejects.toThrow(`Input ${TXID_B}:1 has no expected prevout`);
      expect(readers.readOutspend).not.toHaveBeenCalled();
    });
  });

  it("rejects a transaction that references one outpoint twice, before any read", async () => {
    const tx = new Transaction();
    tx.addInput(Buffer.from(TXID_A, "hex").reverse(), 0);
    tx.addInput(Buffer.from(TXID_A, "hex").reverse(), 0);
    tx.addOutput(Buffer.from("0014" + "11".repeat(20), "hex"), 1_000);
    const readers = readersFor({ scripts: EXISTING });

    await expect(
      assertOutpointsAvailable({ unsignedTxHex: tx.toHex(), readers }),
    ).rejects.toThrow(/duplicate input/);
    expect(readers.readOutspend).not.toHaveBeenCalled();
  });
});
