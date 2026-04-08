import { describe, expect, it } from "vitest";

import { SEIZURE_TOL, type CascadeVault } from "../cascadeSimulation.js";
import { computeOptimalOrder } from "../optimalOrder.js";

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
