import { describe, expect, it } from "vitest";

import { attributeBatchResults } from "../batchAttribution";

const TXID_A = "a".repeat(64);
const TXID_B = "b".repeat(64);
const TXID_C = "c".repeat(64);

describe("attributeBatchResults", () => {
  it("attributes happy-path one-to-one results", () => {
    const out = attributeBatchResults([TXID_A, TXID_B], [
      { pegin_txid: TXID_A, result: { v: 1 }, error: null },
      { pegin_txid: TXID_B, result: { v: 2 }, error: null },
    ]);
    expect(out.byTxid.get(TXID_A)?.result).toEqual({ v: 1 });
    expect(out.byTxid.get(TXID_B)?.result).toEqual({ v: 2 });
    expect(out.missing).toEqual([]);
    expect(out.duplicate).toEqual([]);
    expect(out.unexpected).toEqual([]);
  });

  it("normalizes case on both sides", () => {
    const out = attributeBatchResults([TXID_A.toUpperCase()], [
      { pegin_txid: TXID_A, result: { v: 1 }, error: null },
    ]);
    expect(out.byTxid.get(TXID_A)?.result).toEqual({ v: 1 });
    expect(out.missing).toEqual([]);
  });

  it("flags requested txids missing from response", () => {
    const out = attributeBatchResults([TXID_A, TXID_B], [
      { pegin_txid: TXID_A, result: { v: 1 }, error: null },
    ]);
    expect(out.missing).toEqual([TXID_B]);
  });

  it("flags duplicate echoed txids and keeps first", () => {
    const out = attributeBatchResults([TXID_A], [
      { pegin_txid: TXID_A, result: { v: 1 }, error: null },
      { pegin_txid: TXID_A, result: { v: 2 }, error: null },
    ]);
    expect(out.byTxid.get(TXID_A)?.result).toEqual({ v: 1 });
    expect(out.duplicate).toEqual([TXID_A]);
  });

  it("flags unexpected echoed txids and drops them", () => {
    const out = attributeBatchResults([TXID_A], [
      { pegin_txid: TXID_A, result: { v: 1 }, error: null },
      { pegin_txid: TXID_C, result: { v: 99 }, error: null },
    ]);
    expect(out.byTxid.size).toBe(1);
    expect(out.byTxid.has(TXID_C)).toBe(false);
    expect(out.unexpected).toEqual([TXID_C]);
  });

  it("preserves error envelope when result is null", () => {
    const out = attributeBatchResults([TXID_A], [
      { pegin_txid: TXID_A, result: null, error: "PegIn not found" },
    ]);
    expect(out.byTxid.get(TXID_A)).toEqual({
      result: null,
      error: "PegIn not found",
    });
  });

  it("dedups requested txids", () => {
    const out = attributeBatchResults([TXID_A, TXID_A], [
      { pegin_txid: TXID_A, result: { v: 1 }, error: null },
    ]);
    expect(out.byTxid.size).toBe(1);
    expect(out.missing).toEqual([]);
  });
});
