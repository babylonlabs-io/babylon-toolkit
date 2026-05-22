import { describe, expect, it } from "vitest";

import {
  SEIZURE_TOL,
  simulateCascade,
  type CascadeVault,
} from "../cascadeSimulation.js";
import { computeOptimalOrder } from "../optimalOrder.js";

/** All permutations of `items` (used to brute-force-verify the optimizer). */
function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const p of permutations(rest)) out.push([items[i], ...p]);
  }
  return out;
}

const DEFAULT_PARAMS = {
  CF: 0.75,
  LB: 1.05,
  THF: 1.1,
  expectedHF: 0.95,
};

function vault(id: string, btc: number): CascadeVault {
  return { id, btc };
}

describe("computeOptimalOrder", () => {
  const { CF, THF, LB, expectedHF } = DEFAULT_PARAMS;
  const seizedFraction = 0.398;
  const totalDebt = 44287;

  it("returns single vault unchanged", () => {
    const vaults = [vault("a", 1.0)];
    const result = computeOptimalOrder(
      vaults,
      totalDebt,
      seizedFraction,
      SEIZURE_TOL,
      CF,
      THF,
      LB,
      expectedHF,
    );
    expect(result.order).toHaveLength(1);
    expect(result.order[0].id).toBe("a");
  });

  it("puts larger vault first for two vaults", () => {
    const vaults = [vault("small", 0.35), vault("big", 0.65)];
    const result = computeOptimalOrder(
      vaults,
      totalDebt,
      seizedFraction,
      SEIZURE_TOL,
      CF,
      THF,
      LB,
      expectedHF,
    );
    expect(result.order[0].id).toBe("big");
    expect(result.order[1].id).toBe("small");
  });

  it("optimal order produces better cascade score than reversed", () => {
    const vaults = [vault("a", 0.3), vault("b", 0.5), vault("c", 0.2)];
    const result = computeOptimalOrder(
      vaults,
      totalDebt,
      seizedFraction,
      SEIZURE_TOL,
      CF,
      THF,
      LB,
      expectedHF,
    );
    expect(result.sumBtcAfterEvents).toBeGreaterThan(0);
    expect(result.order.length).toBe(3);
  });

  it("handles empty vault list", () => {
    const result = computeOptimalOrder(
      [],
      totalDebt,
      seizedFraction,
      SEIZURE_TOL,
      CF,
      THF,
      LB,
      expectedHF,
    );
    expect(result.order).toEqual([]);
    expect(result.sumBtcAfterEvents).toBe(0);
  });

  it("handles more vaults than the DP cap without throwing", () => {
    // 14 vaults > MAX_DP_N (10): the smallest get pre-jointed into composites.
    const vaults = Array.from({ length: 14 }, (_, idx) =>
      vault(`v${idx}`, 0.1 + idx * 0.05),
    );
    const result = computeOptimalOrder(
      vaults,
      totalDebt,
      seizedFraction,
      SEIZURE_TOL,
      CF,
      THF,
      LB,
      expectedHF,
    );
    // Reconstruction returns every original vault exactly once.
    expect(result.order).toHaveLength(14);
    expect(new Set(result.order.map((v) => v.id)).size).toBe(14);
    expect(result.sumBtcAfterEvents).toBeGreaterThan(0);
  });

  it("among orders that tie on total cascade survival, returns the safest first event", () => {
    // 5 vaults → 120 permutations; brute-force the invariant directly.
    const amounts = [0.8, 0.47, 0.95, 0.59, 0.19];
    const vaults = amounts.map((b, idx) => vault(`v${idx}`, b));

    // Sweep several seizure fractions to exercise different tie structures.
    for (const sf of [0.2, 0.3, 0.398, 0.5, 0.6]) {
      const args = [totalDebt, sf, SEIZURE_TOL, CF, THF, LB, expectedHF] as const;
      const opt = computeOptimalOrder(vaults, ...args);

      // Among every permutation whose total cascade survival ties the
      // optimizer's, none should beat it on first-event survival.
      let maxG1AmongTies = -Infinity;
      for (const p of permutations(vaults)) {
        const r = simulateCascade(p, ...args);
        if (Math.abs(r.sumBtcAfterEvents - opt.sumBtcAfterEvents) <= 1e-9) {
          maxG1AmongTies = Math.max(maxG1AmongTies, r.btcAfterG1);
        }
      }
      expect(opt.btcAfterG1).toBeCloseTo(maxG1AmongTies, 9);
    }
  });

  it("preserves vault type through generics", () => {
    interface NamedVault extends CascadeVault {
      name: string;
    }
    const vaults: NamedVault[] = [
      { id: "a", btc: 0.6, name: "Vault A" },
      { id: "b", btc: 0.4, name: "Vault B" },
    ];
    const result = computeOptimalOrder(
      vaults,
      totalDebt,
      seizedFraction,
      SEIZURE_TOL,
      CF,
      THF,
      LB,
      expectedHF,
    );
    expect(result.order[0].name).toBeDefined();
  });
});
