import { describe, expect, it } from "vitest";

import {
  getGroup1FromOrder,
  SEIZURE_TOL,
  simulateCascade,
  type CascadeVault,
} from "../cascadeSimulation.js";

const DEFAULT_PARAMS = {
  CF: 0.75,
  LB: 1.05,
  THF: 1.1,
  expectedHF: 0.95,
};

function vault(id: string, btc: number): CascadeVault {
  return { id, btc };
}

describe("cascadeSimulation", () => {
  describe("getGroup1FromOrder", () => {
    it("returns single vault when it covers target", () => {
      const order = [vault("a", 0.6), vault("b", 0.4)];
      // seizedFraction ~0.398, totalBtc=1.0, threshold ~0.394
      const g1 = getGroup1FromOrder(order, 0.398, SEIZURE_TOL);
      expect(g1).toHaveLength(1);
      expect(g1[0].id).toBe("a");
    });

    it("returns multiple vaults when first is too small", () => {
      const order = [vault("a", 0.2), vault("b", 0.3), vault("c", 0.5)];
      // totalBtc=1.0, threshold ~0.394
      const g1 = getGroup1FromOrder(order, 0.398, SEIZURE_TOL);
      expect(g1).toHaveLength(2);
      expect(g1.map((v) => v.id)).toEqual(["a", "b"]);
    });

    it("returns all vaults when none cover target individually", () => {
      // Use high seized fraction so neither vault alone covers threshold
      const order = [vault("a", 0.1), vault("b", 0.1)];
      // totalBtc=0.2, threshold=0.2*0.7*0.99=0.1386, neither 0.1 alone covers it
      const g1 = getGroup1FromOrder(order, 0.7, SEIZURE_TOL);
      expect(g1).toHaveLength(2);
    });

    it("returns empty for empty input", () => {
      expect(getGroup1FromOrder([], 0.398, SEIZURE_TOL)).toEqual([]);
    });
  });

  describe("simulateCascade", () => {
    const { CF, THF, LB, expectedHF } = DEFAULT_PARAMS;
    const seizedFraction = 0.398;

    it("single vault produces zero remaining BTC", () => {
      const order = [vault("a", 1.0)];
      const result = simulateCascade(
        order,
        44287,
        seizedFraction,
        SEIZURE_TOL,
        CF,
        THF,
        LB,
        expectedHF,
      );
      expect(result.sumBtcAfterEvents).toBe(0);
      expect(result.btcAfterG1).toBe(0);
    });

    it("two well-ordered vaults preserve some BTC after G1", () => {
      const order = [vault("a", 0.6), vault("b", 0.4)];
      const result = simulateCascade(
        order,
        44287,
        seizedFraction,
        SEIZURE_TOL,
        CF,
        THF,
        LB,
        expectedHF,
      );
      expect(result.btcAfterG1).toBeCloseTo(0.4, 2);
      expect(result.sumBtcAfterEvents).toBeGreaterThan(0);
    });

    it("order with smaller sacrificial vault preserves more BTC", () => {
      // [0.4, 0.6]: seizes 0.4 first, leaves 0.6 — better
      const smallFirst = [vault("a", 0.4), vault("b", 0.6)];
      // [0.6, 0.4]: seizes 0.6 first, leaves 0.4 — worse
      const bigFirst = [vault("b", 0.6), vault("a", 0.4)];

      const smallFirstResult = simulateCascade(
        smallFirst,
        44287,
        seizedFraction,
        SEIZURE_TOL,
        CF,
        THF,
        LB,
        expectedHF,
      );
      const bigFirstResult = simulateCascade(
        bigFirst,
        44287,
        seizedFraction,
        SEIZURE_TOL,
        CF,
        THF,
        LB,
        expectedHF,
      );

      expect(smallFirstResult.btcAfterG1).toBeGreaterThan(
        bigFirstResult.btcAfterG1,
      );
    });
  });
});
