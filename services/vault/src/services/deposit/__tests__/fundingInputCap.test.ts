import { describe, expect, it } from "vitest";

import {
  capFundingUtxos,
  MAX_PRE_PEGIN_FUNDING_INPUTS,
} from "../fundingInputCap";

interface TestUtxo {
  id: string;
  value: number;
}

function makeUtxos(count: number): TestUtxo[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `utxo-${i}`,
    value: (i + 1) * 1000,
  }));
}

describe("capFundingUtxos", () => {
  it("returns the 20 largest UTXOs, sorted value-descending, from 25", () => {
    const utxos = makeUtxos(25);
    const result = capFundingUtxos(utxos);

    expect(result).toHaveLength(MAX_PRE_PEGIN_FUNDING_INPUTS);
    expect(result.map((u) => u.value)).toEqual([
      25000, 24000, 23000, 22000, 21000, 20000, 19000, 18000, 17000, 16000,
      15000, 14000, 13000, 12000, 11000, 10000, 9000, 8000, 7000, 6000,
    ]);
    for (let i = 0; i < result.length - 1; i++) {
      expect(result[i].value).toBeGreaterThan(result[i + 1].value);
    }
  });

  it("returns all UTXOs, sorted value-descending, when 20 or fewer", () => {
    const utxos = makeUtxos(20);
    const result = capFundingUtxos(utxos);

    expect(result).toHaveLength(20);
    expect(result[0].value).toBe(20000);
    expect(result[19].value).toBe(1000);
  });

  it("returns all UTXOs when fewer than 20", () => {
    const utxos = makeUtxos(5);
    const result = capFundingUtxos(utxos);

    expect(result).toHaveLength(5);
    expect(result.map((u) => u.value)).toEqual([5000, 4000, 3000, 2000, 1000]);
  });

  it("does not mutate the input array or its order", () => {
    const utxos = makeUtxos(5);
    const original = [...utxos];

    capFundingUtxos(utxos);

    expect(utxos).toEqual(original);
  });

  it("returns an empty array for an empty input", () => {
    expect(capFundingUtxos([])).toEqual([]);
  });
});
