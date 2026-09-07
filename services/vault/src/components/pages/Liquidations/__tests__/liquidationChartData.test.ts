import { describe, expect, it } from "vitest";

import { calculate } from "@/applications/aave/positionNotifications/calculate";
import type {
  CalculatorResult,
  LiquidationGroup,
  Vault,
} from "@/applications/aave/positionNotifications/types";
import { COPY } from "@/copy";
import { formatBtcAmount } from "@/utils/formatting";

import {
  axisFloorPrice,
  buildLiquidationChartData,
  buildSimulationSummary,
  buildTimelinePriceAxis,
  buildTimelineSafeZone,
  formatCandleDate,
  formatCandleTimestamp,
  withAmountInBandLabel,
} from "../liquidationChartData";

// `calculate()` emits 1-based `index` fields (`groupIndex` starts at 1 in
// calculate.ts, and the dust early-return hardcodes 1) — these hand-built
// fixtures match that so a fixture that quietly assumed 0-based indices can't
// hide a real index-base bug again. Pass the real 1-based index (1, 2, 3, …).
function makeGroup(
  index: number,
  overrides: Partial<LiquidationGroup> = {},
): LiquidationGroup {
  return {
    index,
    vaults: [{ id: `v${index}`, name: `Vault ${index}`, btc: 0.5 }],
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

// Params for driving a real cascade through `calculate()` — the E1 scenario
// from calculate.test.ts ([0.42, 0.29, 0.29]), which produces exactly 3
// groups with no cliff/reorder warnings muddying the group breakdown.
const REAL_CF = 0.75;
const REAL_THF = 1.1;
const REAL_MAX_LB = 1.05;
const REAL_EXPECTED_HF = 0.95;
const REAL_BTC_PRICE = 61722.5;
const REAL_DEBT_USD = 44287.72;

function realCascadeResult(): CalculatorResult {
  const vaults: Vault[] = [
    { id: "v1", name: "Vault 1", btc: 0.42 },
    { id: "v2", name: "Vault 2", btc: 0.29 },
    { id: "v3", name: "Vault 3", btc: 0.29 },
  ];
  return calculate({
    btcPrice: REAL_BTC_PRICE,
    totalDebtUsd: REAL_DEBT_USD,
    vaults,
    CF: REAL_CF,
    THF: REAL_THF,
    maxLB: REAL_MAX_LB,
    expectedHF: REAL_EXPECTED_HF,
  });
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

/**
 * Vault tally for a fixture. These cascades consume every vault, so counting
 * the groups gives the true position total; the case where they diverge (a
 * cascade that ends early) is covered explicitly in `buildSimulationSummary`.
 */
const vaultCount = (result: CalculatorResult) =>
  result.groups.reduce((n, g) => n + g.vaults.length, 0);

describe("buildLiquidationChartData", () => {
  it("maps each group to a band with cycling tones and 1-based labels", () => {
    const result = makeResult([makeGroup(1), makeGroup(2), makeGroup(3)]);
    const { bands } = buildLiquidationChartData(result, {
      vaultsTotal: vaultCount(result),
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
      makeGroup(1, { liquidationPrice: 77682 }),
      makeGroup(2, { liquidationPrice: 40283 }),
      makeGroup(3, { liquidationPrice: 3597 }),
    ]);
    const { bands, priceAxis } = buildLiquidationChartData(result, {
      vaultsTotal: vaultCount(result),
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
      makeGroup(1, { combinedBtc: 0.6 }),
      makeGroup(2, { combinedBtc: 0.4 }),
    ]);
    const { bands } = buildLiquidationChartData(result, {
      vaultsTotal: vaultCount(result),
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
      makeGroup(1, {
        combinedBtc: 0.6,
        liquidationPrice: 77_682,
        distancePct: -12.1,
      }),
      makeGroup(2, { combinedBtc: 0.4, liquidationPrice: 40_283 }),
    ]);
    const { bands } = buildLiquidationChartData(result, {
      vaultsTotal: vaultCount(result),
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

  it("keys titles off array position, not the calculator's 1-based index", () => {
    // calculate() emits group.index starting at 1.
    const result = makeResult([
      makeGroup(1, { liquidationPrice: 77_682 }),
      makeGroup(2, { liquidationPrice: 40_283 }),
    ]);
    const { bands, cards } = buildLiquidationChartData(result, {
      vaultsTotal: vaultCount(result),
      btcPrice: 90_000,
      collateralFactor: CF,
    });

    expect(bands[0].label).toBe("Liq Event 1");
    expect(cards[0].title).toBe("Liq Event 1");
    expect(cards[1].title).toBe("Liq Event 2");
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
      vaultsTotal: vaultCount(result),
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
      vaultsTotal: vaultCount(result),
      btcPrice: Number.NaN,
      livePrice: Number.NaN,
      collateralFactor: CF,
    });

    expect(priceAxis.every((t) => Number.isFinite(t.value))).toBe(true);
  });

  it("anchors the axis to the live price, never the simulated one", () => {
    const result = makeResult([
      makeGroup(1, { combinedBtc: 0.6, liquidationPrice: 77_682 }),
      makeGroup(2, { combinedBtc: 0.4, liquidationPrice: 40_283 }),
    ]);
    const { priceAxis } = buildLiquidationChartData(result, {
      vaultsTotal: vaultCount(result),
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
      makeGroup(1, { combinedBtc: 0.6, liquidationPrice: 77_682 }),
      makeGroup(2, { combinedBtc: 0.4, liquidationPrice: 40_283 }),
    ]);
    const { priceAxis } = buildLiquidationChartData(result, {
      vaultsTotal: vaultCount(result),
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
      makeGroup(1, { combinedBtc: 0.9 }),
      makeGroup(2, { combinedBtc: 0.09 }),
      makeGroup(3, { combinedBtc: 0.01 }),
    ]);
    const { bands, shareAxisTicks } = buildLiquidationChartData(result, {
      vaultsTotal: vaultCount(result),
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
      makeGroup(1, { liquidationPrice: 77682 }),
      makeGroup(2, { liquidationPrice: 40283 }),
    ]);
    const { bands } = buildLiquidationChartData(result, {
      vaultsTotal: vaultCount(result),
      btcPrice: 60000,
      collateralFactor: CF,
    });

    expect(bands[0].state).toBe("liquidated");
    expect(bands[1].state).toBe("live");
  });

  it("falls back to the evaluated price as the axis anchor when no live price is supplied", () => {
    const result = makeResult([
      makeGroup(1, { liquidationPrice: 77682 }),
      makeGroup(2, { liquidationPrice: 40283 }),
    ]);
    const { priceAxis } = buildLiquidationChartData(result, {
      vaultsTotal: vaultCount(result),
      btcPrice: 88400,
      collateralFactor: CF,
    });

    const values = priceAxis.map((t) => t.value);
    expect(values[0]).toBe(88400);
    expect(values).toStrictEqual([...values].sort((a, b) => b - a));
  });

  it("keeps the price axis descending when the anchor falls between two triggers", () => {
    const result = makeResult([
      makeGroup(1, { liquidationPrice: 77682 }),
      makeGroup(2, { liquidationPrice: 40283 }),
    ]);
    // 60000 sits between the triggers: it must slot into the axis by value.
    // Prepending the anchor instead of sorting would put it above 77682 and
    // break the strictly-descending contract the price scale asserts on.
    const { priceAxis } = buildLiquidationChartData(result, {
      vaultsTotal: vaultCount(result),
      btcPrice: 60000,
      collateralFactor: CF,
    });

    expect(priceAxis.map((t) => t.value)).toEqual([
      77682, 60000, 40283, 38268.85,
    ]);
  });

  it("derives post-liquidation HF from remaining collateral × the event's own trigger price × CF ÷ debt", () => {
    const result = makeResult([
      makeGroup(1, {
        liquidationPrice: 88400,
        btcRemainingAfter: 0.5,
        debtRemainingAfter: 15106,
      }),
    ]);
    const { cards } = buildLiquidationChartData(result, {
      vaultsTotal: vaultCount(result),
      // Simulated price deliberately far from the trigger — hfAfter must not
      // move with it (regression for the ~25x bug where it divided by the
      // simulated price instead).
      btcPrice: 40000,
      collateralFactor: CF,
    });

    // The liquidation executes at the trigger ($88,400), so the aftermath is
    // priced there, not at the ambient/simulated price:
    // 0.5 * 88400 * 0.75 / 15106 = 2.194...
    expect(cards[0].hfAfterLabel).toBe("2.194");
  });

  it("shows ∞ HF when no debt remains", () => {
    const result = makeResult([makeGroup(1, { debtRemainingAfter: 0 })]);
    const { cards } = buildLiquidationChartData(result, {
      vaultsTotal: vaultCount(result),
      btcPrice: 88400,
      collateralFactor: CF,
    });

    expect(cards[0].hfAfterLabel).toBe("∞");
  });

  // Group `index` fields are 1-based and unrelated to array position (a real
  // cascade never emits index 0 — see calculate.ts). Title and tone must both
  // key off the group's POSITION in the array, not `group.index`.
  it("titles and tones groups by array position, not group.index", () => {
    const result = makeResult([makeGroup(1), makeGroup(2), makeGroup(3)]);
    const { cards } = buildLiquidationChartData(result, {
      vaultsTotal: vaultCount(result),
      btcPrice: 90000,
      collateralFactor: CF,
    });

    expect(cards.map((c) => c.title)).toEqual([
      "Liq Event 1",
      "Liq Event 2",
      "Liq Event 3",
    ]);
    expect(cards.map((c) => c.tone)).toEqual(["1", "2", "3"]);
  });

  it("titles the first event 'Liq Event 1' regardless of the group's index field", () => {
    const result = makeResult([makeGroup(1), makeGroup(2), makeGroup(3)]);
    const { cards } = buildLiquidationChartData(result, {
      vaultsTotal: vaultCount(result),
      btcPrice: 90000,
      collateralFactor: CF,
    });

    expect(cards.map((c) => c.title)).toEqual([
      "Liq Event 1",
      "Liq Event 2",
      "Liq Event 3",
    ]);
  });

  it("gives each card the same tone as its corresponding band", () => {
    const result = makeResult([makeGroup(1), makeGroup(2), makeGroup(3)]);
    const { cards, bands } = buildLiquidationChartData(result, {
      vaultsTotal: vaultCount(result),
      btcPrice: 90000,
      collateralFactor: CF,
    });

    expect(cards.map((c) => c.tone)).toEqual(bands.map((b) => b.tone));
    // Cards and bands must also still key/scroll-target consistently.
    expect(cards.map((c) => c.key)).toEqual(bands.map((b) => b.key));
  });

  // Drives the assertions from a REAL calculate() cascade (not hand-built
  // groups), so these fixtures can't drift from the calculator's actual index
  // base the way the hand-built ones once did.
  it("titles and tones groups by array position from a real calculate() result", () => {
    const result = realCascadeResult();
    expect(result.groups).toHaveLength(3);
    // Confirms the fixture still exercises the bug: calculate() emits 1-based
    // indices, never 0.
    expect(result.groups.map((g) => g.index)).toEqual([1, 2, 3]);

    const { cards, bands } = buildLiquidationChartData(result, {
      vaultsTotal: vaultCount(result),
      btcPrice: REAL_BTC_PRICE,
      collateralFactor: REAL_CF,
    });

    expect(cards[0].title).toBe("Liq Event 1");
    expect(cards.map((c) => c.tone)).toEqual(bands.map((b) => b.tone));
    expect(cards.map((c) => c.key)).toEqual(bands.map((b) => b.key));
  });

  it("renders the full-liquidation group's fairness as a wBTC payment, priced at the event's own trigger", () => {
    const result = makeResult([
      makeGroup(1, {
        isFullLiquidation: true,
        fairnessPaymentUsd: 81,
        liquidationPrice: 40500,
        debtRemainingAfter: 0,
      }),
    ]);
    const { cards } = buildLiquidationChartData(result, {
      vaultsTotal: vaultCount(result),
      // Simulated price deliberately far from the trigger — the fairness
      // wBTC amount must not slide with it.
      btcPrice: 90000,
      collateralFactor: CF,
    });

    expect(cards[0].fairness.label).toBe("Fairness Payment (wBTC)");
    expect(cards[0].fairness.value).toContain("$81");
    // Converted at the event's trigger price: 81 / 40500 = 0.002 BTC.
    expect(cards[0].fairness.value).toContain("0.002");
  });

  // Each fairness variant carries its own tooltip: the payment variant
  // describes a payment to the user's wallet, the debt-repaid variant
  // describes the liquidator's additional debt repayment.
  it("carries the matching fairness tooltip per variant", () => {
    const paymentResult = makeResult([
      makeGroup(1, { isFullLiquidation: true, fairnessPaymentUsd: 81 }),
    ]);
    const debtRepaidResult = makeResult([
      makeGroup(1, { isFullLiquidation: false }),
    ]);
    const options = {
      vaultsTotal: 1,
      btcPrice: 90000,
      collateralFactor: CF,
    };

    expect(
      buildLiquidationChartData(paymentResult, options).cards[0].fairness
        .tooltip,
    ).toBe(COPY.liquidations.events.fairnessPaymentTooltip);
    expect(
      buildLiquidationChartData(debtRepaidResult, options).cards[0].fairness
        .tooltip,
    ).toBe(COPY.liquidations.events.fairnessDebtRepaidTooltip);
  });

  // The card colour used to key off array position, so a later event stayed
  // green even after the price had fallen through its trigger.
  it("marks a card triggered on the same rule that flips its band", () => {
    const result = makeResult([
      makeGroup(1, { liquidationPrice: 77_682 }),
      makeGroup(2, { liquidationPrice: 40_283 }),
      makeGroup(3, { liquidationPrice: 10_000 }),
    ]);
    const { cards, bands } = buildLiquidationChartData(result, {
      btcPrice: 40_283,
      collateralFactor: CF,
      vaultsTotal: 3,
    });

    expect(cards.map((c) => c.triggered)).toEqual([true, true, false]);
    // A card and its band can never disagree about whether the event fired.
    expect(cards.map((c) => c.triggered)).toEqual(
      bands.map((b) => b.state === "liquidated"),
    );
    // A later-position event has demonstrably triggered.
    expect(cards[1].triggered).toBe(true);
  });

  // Without a sign, an already-passed trigger's "+18.1%" was visually
  // identical to the "-18.1%" of an event still that far below.
  it("signs a positive distance so a passed trigger reads differently", () => {
    const result = makeResult([
      makeGroup(1, { distancePct: 18.1 }),
      makeGroup(2, { distancePct: -18.1 }),
    ]);
    const { cards } = buildLiquidationChartData(result, {
      btcPrice: 90_000,
      collateralFactor: CF,
      vaultsTotal: 2,
    });

    expect(cards[0].distanceLabel).toBe("+18.1%");
    expect(cards[1].distanceLabel).toBe("-18.1%");
  });
});

describe("buildSimulationSummary", () => {
  it("reports nothing seized while the price is above every trigger", () => {
    const result = makeResult([
      makeGroup(1, { combinedBtc: 0.6, liquidationPrice: 77_682 }),
      makeGroup(2, {
        combinedBtc: 0.4,
        liquidationPrice: 40_283,
        btcRemainingAfter: 0,
      }),
    ]);
    const summary = buildSimulationSummary(result, 90_000, 2);

    expect(summary.vaultsLiquidated).toBe(0);
    expect(summary.vaultsTotal).toBe(2);
    expect(summary.seizedPct).toBe(0);
    expect(summary.collateralRemainingLabel).toMatch(/^1 /);
  });

  it("seizes a group once the price reaches its trigger", () => {
    const result = makeResult([
      makeGroup(1, { combinedBtc: 0.6, liquidationPrice: 77_682 }),
      makeGroup(2, {
        combinedBtc: 0.4,
        liquidationPrice: 40_283,
        btcRemainingAfter: 0,
      }),
    ]);
    const summary = buildSimulationSummary(result, 77_682, 2);

    expect(summary.vaultsLiquidated).toBe(1);
    expect(summary.seizedPct).toBe(60);
    expect(summary.collateralRemainingLabel).toMatch(/^0\.4 /);
  });

  it("seizes everything below the last trigger and counts every vault", () => {
    const result = makeResult([
      makeGroup(1, {
        combinedBtc: 0.6,
        liquidationPrice: 77_682,
        vaults: [
          { id: "a", name: "Vault 1", btc: 0.3 },
          { id: "b", name: "Vault 2", btc: 0.3 },
        ],
      }),
      makeGroup(2, {
        combinedBtc: 0.4,
        liquidationPrice: 40_283,
        btcRemainingAfter: 0,
      }),
    ]);
    const summary = buildSimulationSummary(result, 10_000, 3);

    expect(summary.vaultsLiquidated).toBe(3);
    expect(summary.vaultsTotal).toBe(3);
    expect(summary.seizedPct).toBe(100);
    expect(summary.collateralRemainingLabel).toMatch(/^0 /);
  });

  // `calculate()` exits as soon as the remaining debt clears, so a vault it
  // never had to consume gets no group at all. Normalising against the groups
  // erased it: the header read "100% seized / 0 BTC" while the position card
  // directly above still showed the surviving collateral.
  it("counts collateral the cascade never had to consume", () => {
    const result = makeResult([
      makeGroup(1, {
        combinedBtc: 2.8,
        liquidationPrice: 77_682,
        // 0.37 BTC of the position outlives the cascade.
        btcRemainingAfter: 0.37,
      }),
    ]);
    const summary = buildSimulationSummary(result, 10_000, 3);

    expect(summary.vaultsTotal).toBe(3);
    expect(summary.seizedPct).toBe(88);
    expect(summary.collateralRemainingLabel).toMatch(/^0\.37 /);
  });

  it("degrades to zeros with no groups", () => {
    const summary = buildSimulationSummary(makeResult([]), 90_000, 0);

    expect(summary.vaultsLiquidated).toBe(0);
    expect(summary.vaultsTotal).toBe(0);
    expect(summary.seizedPct).toBe(0);
  });
});

describe("buildTimelinePriceAxis", () => {
  const result = makeResult([
    makeGroup(1, { liquidationPrice: 67_682 }),
    makeGroup(2, { liquidationPrice: 40_283 }),
    makeGroup(3, { liquidationPrice: 3_597 }),
  ]);

  it("labels round prices down the safe zone and closes on the axis floor", () => {
    const axis = buildTimelinePriceAxis(result, 92_000);

    expect(axis.map((tick) => tick.value)).toEqual([
      100_000,
      90_000,
      80_000,
      70_000,
      axisFloorPrice(result),
    ]);
    expect(axis[0].label).toBe("$100,000");
  });

  it("keeps the top tick clear of the highest candle so nothing is clipped", () => {
    const topPrice = 118_400;

    const axis = buildTimelinePriceAxis(result, topPrice);

    expect(axis[0].value).toBeGreaterThanOrEqual(topPrice);
  });

  // Trigger prices are drawn as their own level lines and pills; a round tick
  // inside a compressed event region would collide with them.
  it("places no tick between the first trigger and the floor", () => {
    const axis = buildTimelinePriceAxis(result, 92_000);
    const firstTrigger = result.groups[0].liquidationPrice;

    const between = axis.filter(
      (tick) =>
        tick.value < firstTrigger && tick.value > axisFloorPrice(result),
    );
    expect(between).toEqual([]);
  });

  it("stays strictly descending for an already-liquidatable position", () => {
    const axis = buildTimelinePriceAxis(result, 30_000);

    const values = axis.map((tick) => tick.value);
    expect(values).toEqual([...values].sort((a, b) => b - a));
    expect(new Set(values).size).toBe(values.length);
    expect(values[values.length - 1]).toBe(axisFloorPrice(result));
  });

  it("still spans the frame with no events at all", () => {
    const axis = buildTimelinePriceAxis(makeResult([]), 90_000);

    expect(axis.length).toBeGreaterThanOrEqual(2);
    expect(axis[0].value).toBeGreaterThanOrEqual(90_000);
    expect(axis[axis.length - 1].value).toBe(0);
  });
});

describe("buildTimelineSafeZone", () => {
  const result = makeResult([makeGroup(1, { liquidationPrice: 77_682 })]);

  it("names the first trigger and the drop needed to reach it", () => {
    const safeZone = buildTimelineSafeZone(result, 88_400);

    expect(safeZone.title).toBe(COPY.liquidations.safeZone.title);
    expect(safeZone.lines).toEqual([
      COPY.liquidations.safeZone.noEventsAbove("$77,682"),
      // (88,400 - 77,682) / 88,400 = 12.1%
      COPY.liquidations.safeZone.dropToFirstEvent("12.1"),
    ]);
  });

  it("reports no remaining drop once the price is through the trigger", () => {
    const safeZone = buildTimelineSafeZone(result, 70_000);

    expect(safeZone.lines[1]).toBe(
      COPY.liquidations.safeZone.dropToFirstEvent("0.0"),
    );
  });
});

describe("withAmountInBandLabel", () => {
  it("folds the amount into the label and drops the separate amount line", () => {
    const { bands } = buildLiquidationChartData(
      makeResult([makeGroup(1, { combinedBtc: 0.6 })]),
      { btcPrice: 90_000, collateralFactor: CF, vaultsTotal: 1 },
    );

    const [band] = withAmountInBandLabel(bands);

    expect(band.label).toBe(
      `${COPY.liquidations.eventTitle(1)} (${formatBtcAmount(0.6)})`,
    );
    expect(band.amountLabel).toBeUndefined();
  });
});

describe("formatCandleDate", () => {
  it("prints the day of the month", () => {
    expect(formatCandleDate(Date.UTC(2026, 4, 19))).toBe("19");
  });

  it("names the month at the start of one, so a multi-month window is placed", () => {
    expect(formatCandleDate(Date.UTC(2026, 5, 3))).toBe("Jun");
  });

  // The hover readout says which candle it describes, which a bare "19" does not.
  it("spells the date out for the crosshair readout", () => {
    expect(formatCandleTimestamp(Date.UTC(2026, 4, 19))).toBe("May 19, 2026");
  });
});
