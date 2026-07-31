import { describe, expect, it } from "vitest";

import type {
  CalculatorResult,
  LiquidationGroup,
} from "@/applications/aave/positionNotifications/types";

import {
  buildLiquidationChartData,
  buildSimulationSummary,
} from "../liquidationChartData";

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
    // The axis stops just under the last trigger, not at $0 — otherwise the
    // final event renders as a hairline.
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

  it("equips each band with popover rows and the true cumulative share", () => {
    const result = makeResult([
      makeGroup(0, {
        combinedBtc: 0.6,
        liquidationPrice: 77_682,
        distancePct: -12.1,
      }),
      makeGroup(1, { combinedBtc: 0.4, liquidationPrice: 40_283 }),
    ]);
    const { bands } = buildLiquidationChartData(result, {
      btcPrice: 90_000,
      collateralFactor: CF,
    });

    const rows = bands[0].popoverMetrics ?? [];
    expect(rows.map((r) => r.label)).toEqual([
      "At price",
      "Distance",
      "Vaults",
      "Seizes",
    ]);
    expect(rows[0]).toMatchObject({ value: "$77,682", emphasis: true });
    expect(rows[1].value).toBe("-12.1%");
    expect(bands[0].cumulativeLabel).toBe("60% seized");
    expect(bands[1].cumulativeLabel).toBe("100% seized");
  });

  it("keys titles and badges off array position, not the calculator's 1-based index", () => {
    // calculate() emits group.index starting at 1.
    const result = makeResult([
      makeGroup(1, { liquidationPrice: 77_682 }),
      makeGroup(2, { liquidationPrice: 40_283 }),
    ]);
    const { bands, cards } = buildLiquidationChartData(result, {
      btcPrice: 90_000,
      collateralFactor: CF,
    });

    expect(bands[0].label).toBe("Liq Event 1");
    expect(cards[0].title).toBe("Liq Event 1");
    expect(cards[0].badge).toBe("sacrificial");
    expect(cards[1].badge).toBe("protected");
  });

  it("prices each event's aftermath at its own trigger, not the simulated price", () => {
    const result = makeResult([
      makeGroup(1, {
        liquidationPrice: 77_682,
        btcRemainingAfter: 0.5,
        debtRemainingAfter: 10_000,
      }),
    ]);
    const { cards } = buildLiquidationChartData(result, {
      btcPrice: 50_000,
      livePrice: 90_000,
      collateralFactor: CF,
    });

    // 0.5 BTC x $77,682 x 0.75 / $10,000 — independent of the $50k simulation.
    expect(cards[0].hfAfterLabel).toBe(
      ((0.5 * 77_682 * CF) / 10_000).toFixed(3),
    );
  });

  it("drops non-finite prices from the axis instead of crashing the scale", () => {
    const result = makeResult([makeGroup(1, { liquidationPrice: 77_682 })]);
    const { priceAxis } = buildLiquidationChartData(result, {
      btcPrice: Number.NaN,
      livePrice: Number.NaN,
      collateralFactor: CF,
    });

    expect(priceAxis.every((t) => Number.isFinite(t.value))).toBe(true);
  });

  it("anchors the axis to the live price, never the simulated one", () => {
    const result = makeResult([
      makeGroup(0, { combinedBtc: 0.6, liquidationPrice: 77_682 }),
      makeGroup(1, { combinedBtc: 0.4, liquidationPrice: 40_283 }),
    ]);
    const { priceAxis } = buildLiquidationChartData(result, {
      btcPrice: 60_000,
      livePrice: 90_000,
      collateralFactor: CF,
    });

    const values = priceAxis.map((t) => t.value);
    expect(values[0]).toBe(90_000);
    expect(values).not.toContain(60_000);
  });

  it("mints no axis segment below the floor when the simulated price drops under it", () => {
    const result = makeResult([
      makeGroup(0, { combinedBtc: 0.6, liquidationPrice: 77_682 }),
      makeGroup(1, { combinedBtc: 0.4, liquidationPrice: 40_283 }),
    ]);
    const { priceAxis } = buildLiquidationChartData(result, {
      btcPrice: 3_000,
      livePrice: 90_000,
      collateralFactor: CF,
    });

    const floor = 40_283 * 0.95;
    expect(Math.min(...priceAxis.map((t) => t.value))).toBeCloseTo(floor);
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

  it("derives post-liquidation HF at the event's trigger price", () => {
    const result = makeResult([
      makeGroup(0, { btcRemainingAfter: 0.5, debtRemainingAfter: 15106 }),
    ]);
    const { cards } = buildLiquidationChartData(result, {
      btcPrice: 88400,
      collateralFactor: CF,
    });

    // The liquidation executes at the trigger ($60,000), so the aftermath is
    // priced there, not at the ambient/simulated price:
    // 0.5 * 60000 * 0.75 / 15106 = 1.489...
    expect(cards[0].hfAfterLabel).toBe("1.489");
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
    // Converted at the event's trigger price: 81 / 60000 = 0.00135 BTC.
    expect(cards[0].fairness.value).toContain("0.00135");
  });
});

describe("buildSimulationSummary", () => {
  it("reports nothing seized while the price is above every trigger", () => {
    const result = makeResult([
      makeGroup(0, { combinedBtc: 0.6, liquidationPrice: 77_682 }),
      makeGroup(1, { combinedBtc: 0.4, liquidationPrice: 40_283 }),
    ]);
    const summary = buildSimulationSummary(result, 90_000);

    expect(summary.vaultsLiquidated).toBe(0);
    expect(summary.vaultsTotal).toBe(2);
    expect(summary.seizedPct).toBe(0);
    expect(summary.collateralRemainingLabel).toMatch(/^1 /);
  });

  it("seizes a group once the price reaches its trigger", () => {
    const result = makeResult([
      makeGroup(0, { combinedBtc: 0.6, liquidationPrice: 77_682 }),
      makeGroup(1, { combinedBtc: 0.4, liquidationPrice: 40_283 }),
    ]);
    const summary = buildSimulationSummary(result, 77_682);

    expect(summary.vaultsLiquidated).toBe(1);
    expect(summary.seizedPct).toBe(60);
    expect(summary.collateralRemainingLabel).toMatch(/^0\.4 /);
  });

  it("seizes everything below the last trigger and counts every vault", () => {
    const result = makeResult([
      makeGroup(0, {
        combinedBtc: 0.6,
        liquidationPrice: 77_682,
        vaults: [
          { id: "a", name: "Vault 1", btc: 0.3 },
          { id: "b", name: "Vault 2", btc: 0.3 },
        ],
      }),
      makeGroup(1, { combinedBtc: 0.4, liquidationPrice: 40_283 }),
    ]);
    const summary = buildSimulationSummary(result, 10_000);

    expect(summary.vaultsLiquidated).toBe(3);
    expect(summary.vaultsTotal).toBe(3);
    expect(summary.seizedPct).toBe(100);
    expect(summary.collateralRemainingLabel).toMatch(/^0 /);
  });

  it("degrades to zeros with no groups", () => {
    const summary = buildSimulationSummary(makeResult([]), 90_000);

    expect(summary.vaultsLiquidated).toBe(0);
    expect(summary.vaultsTotal).toBe(0);
    expect(summary.seizedPct).toBe(0);
  });
});
