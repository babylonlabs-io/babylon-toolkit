import { Transaction } from "bitcoinjs-lib";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../vaultUtxoDerivationService", () => ({
  fetchUTXOFromMempool: vi.fn(),
}));

import { resolveFundedTxFeeAndUtxos } from "../resolveFundedTxFee";
import { fetchUTXOFromMempool } from "../vaultUtxoDerivationService";

// NOTE: this file deliberately uses the global (native) Buffer, not
// `import { Buffer } from "buffer"` — the polyfill package's instances fail
// bitcoinjs/typeforce's native Buffer.isBuffer check (dual-realm Buffer).

// Non-palindromic display-order txids: a missing byte-reverse in production
// would produce a different key/lookup and fail the assertions below.
const TXID_A = "a1".repeat(31) + "b2";
const TXID_B = "c3".repeat(31) + "d4";

/** Build a real tx spending `inputs` (display-order txids) with `outputs` sat values. */
function makeTxHex(
  inputs: { txid: string; vout: number }[],
  outputs: number[],
): string {
  const tx = new Transaction();
  tx.version = 2;
  for (const inp of inputs) {
    // addInput takes the internal (reversed) prev-hash.
    tx.addInput(Buffer.from(inp.txid, "hex").reverse(), inp.vout);
  }
  for (const value of outputs) {
    tx.addOutput(Buffer.from(`0014${"00".repeat(20)}`, "hex"), value);
  }
  return tx.toHex();
}

describe("resolveFundedTxFeeAndUtxos", () => {
  beforeEach(() => vi.mocked(fetchUTXOFromMempool).mockReset());

  it("resolves every prevout from the mempool and computes fee = inputs − outputs", async () => {
    const hex = makeTxHex(
      [
        { txid: TXID_A, vout: 0 },
        { txid: TXID_B, vout: 1 },
      ],
      [1000, 500],
    );
    vi.mocked(fetchUTXOFromMempool)
      .mockResolvedValueOnce({ scriptPubKey: "0014aa", value: 1200 })
      .mockResolvedValueOnce({ scriptPubKey: "0014bb", value: 800 });

    const { expectedUtxos, fundedTxFee } =
      await resolveFundedTxFeeAndUtxos(hex);

    // (1200 + 800) − (1000 + 500)
    expect(fundedTxFee).toBe(500n);
    // Every input queried with its DISPLAY-order txid (production reverses
    // the internal input.hash) — the format broadcastPrePeginTransaction's
    // resolveInputUtxo looks up.
    expect(fetchUTXOFromMempool).toHaveBeenCalledTimes(2);
    expect(fetchUTXOFromMempool).toHaveBeenNthCalledWith(1, TXID_A, 0);
    expect(fetchUTXOFromMempool).toHaveBeenNthCalledWith(2, TXID_B, 1);
    // Complete record so the broadcast never re-resolves.
    expect(Object.keys(expectedUtxos).sort()).toEqual([
      `${TXID_A}:0`,
      `${TXID_B}:1`,
    ]);
    expect(expectedUtxos[`${TXID_A}:0`]).toEqual({
      scriptPubKey: "0014aa",
      value: 1200,
    });
  });

  it("accepts 0x-prefixed tx hex", async () => {
    const hex = makeTxHex([{ txid: TXID_A, vout: 3 }], [999]);
    vi.mocked(fetchUTXOFromMempool).mockResolvedValue({
      scriptPubKey: "0014aa",
      value: 5000,
    });

    const { expectedUtxos, fundedTxFee } = await resolveFundedTxFeeAndUtxos(
      `0x${hex}`,
    );

    expect(fundedTxFee).toBe(4001n);
    expect(expectedUtxos[`${TXID_A}:3`]).toEqual({
      scriptPubKey: "0014aa",
      value: 5000,
    });
  });

  it("throws when the fee is not positive", async () => {
    const hex = makeTxHex([{ txid: TXID_A, vout: 0 }], [1000]);
    vi.mocked(fetchUTXOFromMempool).mockResolvedValue({
      scriptPubKey: "0014aa",
      value: 1000,
    });

    await expect(resolveFundedTxFeeAndUtxos(hex)).rejects.toThrow(
      /do not cover its outputs/,
    );
  });

  it("rejects when any prevout fetch fails (no partial UTXO record)", async () => {
    const hex = makeTxHex(
      [
        { txid: TXID_A, vout: 0 },
        { txid: TXID_B, vout: 1 },
      ],
      [1000],
    );
    vi.mocked(fetchUTXOFromMempool)
      .mockResolvedValueOnce({ scriptPubKey: "0014aa", value: 1200 })
      .mockRejectedValueOnce(new Error("mempool 404"));

    await expect(resolveFundedTxFeeAndUtxos(hex)).rejects.toThrow(
      /mempool 404/,
    );
  });

  it("throws when the fee exceeds the maximum reasonable fee cap", async () => {
    // 2_001_000 in − 1_000_000 out = 1_001_000 fee > the 1_000_000 sat cap.
    const hex = makeTxHex([{ txid: TXID_A, vout: 0 }], [1_000_000]);
    vi.mocked(fetchUTXOFromMempool).mockResolvedValue({
      scriptPubKey: "0014aa",
      value: 2_001_000,
    });

    await expect(resolveFundedTxFeeAndUtxos(hex)).rejects.toThrow(
      /exceeds the maximum reasonable fee/,
    );
  });
});
