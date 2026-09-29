import { describe, expect, it } from "vitest";

import { fragmentUtxos } from "../utxos";

const REAL = [
  {
    txid: "a".repeat(64),
    vout: 1,
    value: 70_001,
    scriptPubKey: "5120ab",
    confirmed: true,
  },
  {
    txid: "b".repeat(64),
    vout: 0,
    value: 30_000,
    scriptPubKey: "5120cd",
    confirmed: true,
  },
];

describe("fragmentUtxos", () => {
  it("splits the total evenly into N unique, script-carrying fragments", () => {
    const fragments = fragmentUtxos(REAL, 3);

    expect(fragments).toHaveLength(3);
    expect(fragments.reduce((sum, u) => sum + u.value, 0)).toBe(100_001);
    expect(fragments.map((u) => u.value)).toEqual([33_335, 33_333, 33_333]);
    expect(new Set(fragments.map((u) => `${u.txid}:${u.vout}`)).size).toBe(3);
    expect(fragments.every((u) => u.scriptPubKey === "5120ab")).toBe(true);
    expect(fragments.every((u) => u.txid.length === 64)).toBe(true);
  });

  it("passes an empty set through", () => {
    expect(fragmentUtxos([], 5)).toEqual([]);
  });
});
