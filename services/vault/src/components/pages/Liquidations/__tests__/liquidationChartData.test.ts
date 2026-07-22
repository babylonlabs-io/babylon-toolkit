import { describe, expect, it } from "vitest";

import type {
  CalculatorResult,
  LiquidationGroup,
} from "@/applications/aave/positionNotifications/types";

import { buildLiquidationChartData } from "../liquidationChartData";

// ── Fixtures ─────────────────────────────────────────────────────

function makeGroup(
  index: number,
  overrides: Partial<LiquidationGroup> = {},
): LiquidationGroup {
  return {
    index,
    vaults: [{ id: `v${index}`, name: `Vault ${index + 1}`, btc: 0.5 }],
    combinedBtc: 0.5,
    liquidationPrice: 60000,
    distancePct: -10,
    targetSeizureBtc: 0.48,
    overSeizureBtc: 0.02,
    isFullLiquidation: false,
    debtToRepay: 1000,
    liquidatorProfitUsd: 100,
    debtRepaid: 1000,
    fairnessDebtRepay: 50,
    fairnessPaymentUsd: 0,
    debtRemainingAfter: 5000,
    btcRemainingAfter: 0.5,
    ...overrides,
  };
}

function makeResult(groups: LiquidationGroup[]): CalculatorResult {
  return {
    groups,
    currentHF: 1.2,
    collateralValue: 100000,
    targetSeizureBtc: 1,
    warnings: [],
    optimalVaultOrder: null,
    suggestedNewVaultBtc: null,
  };
}

const CF = 0.75;

// ── Tests ────────────────────────────────────────────────────────

describe("buildLiquidationChartData", () => {
  it("maps each group to a band with cycling tones and 1-based labels", () => {
    const result = makeResult([makeGroup(0), makeGroup(1), makeGroup(2)]);
    const { bands } = buildLiquidationChartData(result, {
      btcPrice: 90000,
      collateralFactor: CF,
    });

    expect(bands).toHaveLength(3);
    expect(bands.map((b) => b.tone)).toEqual(["1", "2", "3"]);
    expect(bands.map((b) => b.label)).toEqual([
      "Liq Event 1",
      "Liq Event 2",
      "Liq Event 3",
    ]);
  });

  it("stacks band price extents from each trigger down to the next (last → axis floor)", () => {
    const result = makeResult([
      makeGroup(0, { liquidationPrice: 77682 }),
      makeGroup(1, { liquidationPrice: 40283 }),
      makeGroup(2, { liquidationPrice: 3597 }),
    ]);
    const { bands, priceAxis } = buildLiquidationChartData(result, {
      btcPrice: 88400,
      collateralFactor: CF,
    });

    expect(bands[0].priceTop).toBe(77682);
    expect(bands[0].priceBottom).toBe(40283);
    // The axis stops just under the last trigger (Figma's $3,417 floor), not
    // at $0 — otherwise the final event renders as a hairline.
    expect(bands[2].priceBottom).toBeCloseTo(3417.15, 2);
    expect(priceAxis.map((t) => t.value)).toEqual([
      88400, 77682, 40283, 3597, 3417.1499999999996,
    ]);
  });

  it("tiles band widths edge to edge across the whole axis", () => {
    const result = makeResult([
      makeGroup(0, { combinedBtc: 0.6 }),
      makeGroup(1, { combinedBtc: 0.4 }),
    ]);
    const { bands } = buildLiquidationChartData(result, {
      btcPrice: 90000,
      collateralFactor: CF,
    });

    expect(bands[0].shareStart).toBeCloseTo(0);
    expect(bands[1].shareStart).toBeCloseTo(bands[0].shareEnd);
    expect(bands[1].shareEnd).toBeCloseTo(1);
    // Widths are compressed, so the larger event stays wider without the
    // smaller one collapsing to its raw 40% share.
    expect(bands[0].shareEnd).toBeGreaterThan(0.5);
    expect(bands[0].shareEnd).toBeLessThan(0.6);
  });

  it("keeps the share axis honest about the true cumulative percentages", () => {
    // 90 / 9 / 1 by collateral: the last event is a sliver at true scale.
    const result = makeResult([
      makeGroup(0, { combinedBtc: 0.9 }),
      makeGroup(1, { combinedBtc: 0.09 }),
      makeGroup(2, { combinedBtc: 0.01 }),
    ]);
    const { bands, shareAxisTicks } = buildLiquidationChartData(result, {
      btcPrice: 90000,
      collateralFactor: CF,
    });

    expect(shareAxisTicks.map((t) => t.label)).toEqual([
      "0%",
      "90%",
      "99%",
      "100%",
    ]);
    // Each tick sits on the band edge it names, not at an even interval.
    expect(shareAxisTicks[1].fraction).toBeCloseTo(bands[0].shareEnd);
    expect(shareAxisTicks[2].fraction).toBeCloseTo(bands[1].shareEnd);
    // The 1% event renders far wider than 1% so its label stays readable.
    const lastWidth = bands[2].shareEnd - bands[2].shareStart;
    expect(lastWidth).toBeGreaterThan(0.05);
    expect(lastWidth).toBeLessThan(bands[1].shareEnd - bands[1].shareStart);
  });

  it("marks a band liquidated once the simulated price is at/below its trigger", () => {
    const result = makeResult([
      makeGroup(0, { liquidationPrice: 77682 }),
      makeGroup(1, { liquidationPrice: 40283 }),
    ]);
    const { bands } = buildLiquidationChartData(result, {
      btcPrice: 60000,
      collateralFactor: CF,
    });

    expect(bands[0].state).toBe("liquidated"); // 60000 <= 77682
    expect(bands[1].state).toBe("live"); // 60000 > 40283
  });

  it("keeps the price axis descending when the simulated price drops below a trigger", () => {
    const result = makeResult([
      makeGroup(0, { liquidationPrice: 77682 }),
      makeGroup(1, { liquidationPrice: 40283 }),
    ]);
    // 60000 falls between the two triggers — it must slot in by value, not stay pinned to the top.
    const { priceAxis } = buildLiquidationChartData(result, {
      btcPrice: 60000,
      collateralFactor: CF,
    });

    const values = priceAxis.map((t) => t.value);
    expect(values).toEqual([77682, 60000, 40283, 38268.85]);
    expect(values).toStrictEqual([...values].sort((a, b) => b - a));
  });

  it("derives post-liquidation HF from remaining collateral × price × CF ÷ debt", () => {
    const result = makeResult([
      makeGroup(0, { btcRemainingAfter: 0.5, debtRemainingAfter: 15106 }),
    ]);
    const { cards } = buildLiquidationChartData(result, {
      btcPrice: 88400,
      collateralFactor: CF,
    });

    // 0.5 * 88400 * 0.75 / 15106 = 2.194...
    expect(cards[0].hfAfterLabel).toBe("2.194");
  });

  it("shows ∞ HF when no debt remains", () => {
    const result = makeResult([makeGroup(0, { debtRemainingAfter: 0 })]);
    const { cards } = buildLiquidationChartData(result, {
      btcPrice: 88400,
      collateralFactor: CF,
    });

    expect(cards[0].hfAfterLabel).toBe("∞");
  });

  it("badges only the first-seized group as sacrificial", () => {
    const result = makeResult([makeGroup(0), makeGroup(1), makeGroup(2)]);
    const { cards } = buildLiquidationChartData(result, {
      btcPrice: 90000,
      collateralFactor: CF,
    });

    expect(cards.map((c) => c.badge)).toEqual([
      "sacrificial",
      "protected",
      "protected",
    ]);
  });

  it("renders the full-liquidation group's fairness as a wBTC payment", () => {
    const result = makeResult([
      makeGroup(0, {
        isFullLiquidation: true,
        fairnessPaymentUsd: 81,
        debtRemainingAfter: 0,
      }),
    ]);
    const { cards } = buildLiquidationChartData(result, {
      btcPrice: 40500,
      collateralFactor: CF,
    });

    expect(cards[0].fairness.label).toBe("Fairness Payment (wBTC)");
    expect(cards[0].fairness.value).toContain("$81");
    expect(cards[0].fairness.value).toContain("0.002"); // 81 / 40500 = 0.002 BTC
  });
});
