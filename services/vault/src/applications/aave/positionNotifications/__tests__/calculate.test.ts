import {
  computeOptimalSplit,
  computeSeizedFractionDetailed,
  EXPECTED_HEALTH_FACTOR_AT_LIQUIDATION,
  SPLIT_TARGET_HEALTH_FACTOR,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import { beforeEach, describe, expect, it } from "vitest";

import { COPY } from "@/copy";

import { deriveBannerState } from "../bannerSeverity";
import { calculate, withDistancesAt } from "../calculate";
import type { CalculatorParams, Vault, Warning } from "../types";

// ── Helpers ──────────────────────────────────────────────────────

const DEFAULT_DEBT = 44287.72;
const DEFAULT_BTC_PRICE = 61722.5;
const DEFAULT_CF = 0.75;
const DEFAULT_THF = 1.1;
const DEFAULT_LB = 1.05;
const DEFAULT_EHF = 0.95;

let vaultCounter = 0;
// A flat bonus: 105% at every health factor.
const FLAT_BONUS_CURVE = {
  healthFactorForMaxBonus: 0n,
  liquidationBonusFactor: 10_000n,
  maxLiquidationBonus: 10_500n,
};

// The launch curve: 1.0504 at HF 0.99, and its 105.55% maximum at HF 0.90.
const LAUNCH_BONUS_CURVE = {
  healthFactorForMaxBonus: 900_000_000_000_000_000n,
  liquidationBonusFactor: 9_000n,
  maxLiquidationBonus: 10_555n,
};

function v(btc: number): Vault {
  vaultCounter++;
  return { id: `v${vaultCounter}`, name: `Vault ${vaultCounter}`, btc };
}

function makeParams(
  vaults: Vault[],
  overrides: Partial<CalculatorParams> = {},
): CalculatorParams {
  return {
    btcPrice: DEFAULT_BTC_PRICE,
    totalDebtUsd: DEFAULT_DEBT,
    vaults,
    CF: DEFAULT_CF,
    THF: DEFAULT_THF,
    LB: DEFAULT_LB,
    bonusCurve: FLAT_BONUS_CURVE,
    expectedHF: DEFAULT_EHF,
    minPeginBtc: 0.0005,
    ...overrides,
  };
}

function hasWarning(warnings: Warning[], type: string): boolean {
  return warnings.some((w) => w.type === type);
}

function getWarning(warnings: Warning[], type: string): Warning | undefined {
  return warnings.find((w) => w.type === type);
}

beforeEach(() => {
  vaultCounter = 0;
});

// ── Tests ────────────────────────────────────────────────────────

describe("computeSeizedFractionDetailed", () => {
  it("computes seized fraction for default params", () => {
    const { seizedFraction } = computeSeizedFractionDetailed(
      DEFAULT_CF,
      DEFAULT_LB,
      DEFAULT_THF,
      DEFAULT_EHF,
    );
    // 0.75 × 0.15 / 0.3125 × 1.05/0.95 ≈ 0.3979
    expect(seizedFraction).toBeCloseTo(0.3979, 3);
  });

  it("clamps negative seized fraction to 0", () => {
    const { seizedFraction } = computeSeizedFractionDetailed(
      0.75,
      1.05,
      0.9,
      0.95,
    );
    expect(seizedFraction).toBe(0);
  });

  it("clamps seized fraction above 1 to 1", () => {
    const { seizedFraction, seizedFractionRaw } = computeSeizedFractionDetailed(
      0.95,
      1.05,
      1.5,
      0.95,
    );
    expect(seizedFraction).toBe(1);
    expect(seizedFractionRaw).toBeGreaterThan(1);
  });
});

describe("calculate", () => {
  // ── Early exits ──────────────────────────────────────────────

  it("zero debt — no warnings, no groups, infinite HF", () => {
    const result = calculate(makeParams([v(1.0)], { totalDebtUsd: 0 }));
    expect(result.warnings).toHaveLength(0);
    expect(result.groups).toHaveLength(0);
    expect(result.currentHF).toBe(Infinity);
    expect(result.optimalVaultOrder).toBeNull();
  });

  it("dust — debt under $1k — single dust warning, one full-liquidation group", () => {
    const btc = 0.5;
    const debt = 500;
    const result = calculate(makeParams([v(btc)], { totalDebtUsd: debt }));
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].type).toBe("dust");
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].isFullLiquidation).toBe(true);
    expect(result.optimalVaultOrder).toBeNull();

    const { seizedFraction } = computeSeizedFractionDetailed(
      DEFAULT_CF,
      DEFAULT_LB,
      DEFAULT_THF,
      DEFAULT_EHF,
    );
    const debtToRepay =
      (debt * (DEFAULT_THF - DEFAULT_EHF)) /
      (DEFAULT_THF - DEFAULT_LB * DEFAULT_CF);
    const [group] = result.groups;
    expect(group.targetSeizureBtc).toBeCloseTo(btc * seizedFraction, 8);
    expect(group.overSeizureBtc).toBeCloseTo(btc * (1 - seizedFraction), 8);
    expect(group.debtRepaid).toBe(debt);
    expect(group.liquidatorProfitUsd).toBeCloseTo(
      debtToRepay * (DEFAULT_LB - 1),
      6,
    );
    expect(group.fairnessPaymentUsd).toBeCloseTo(
      debt / DEFAULT_CF - debtToRepay * DEFAULT_LB - (debt - debtToRepay),
      6,
    );
  });

  it("dust — collateral under $1k", () => {
    const result = calculate(makeParams([v(0.00001)]));
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings[0].type).toBe("dust");
    expect(result.warnings[1].type).toBe("urgent");
  });

  // ── Urgent ───────────────────────────────────────────────────

  it("urgent — already liquidatable when HF below 1", () => {
    const result = calculate(makeParams([v(1.0)], { totalDebtUsd: 50000 }));
    const urgent = getWarning(result.warnings, "urgent");
    expect(urgent).toBeDefined();
    expect(urgent?.title).toContain("Liquidation can trigger");
    expect(urgent?.suggestion).toBeDefined();
  });

  it("urgent — within 5% of the liquidation price", () => {
    // [1.0] @ default debt → liq price ~4.3% below current → approaching urgent.
    const result = calculate(makeParams([v(1.0)]));
    const urgent = getWarning(result.warnings, "urgent");
    expect(urgent).toBeDefined();
    expect(urgent?.title).toContain("away");
  });

  it("no urgent when comfortably above the trigger", () => {
    const result = calculate(makeParams([v(2.0)]));
    expect(hasWarning(result.warnings, "urgent")).toBe(false);
  });

  // ── Weird params ─────────────────────────────────────────────

  it("weird-params — soft tone when seized fraction is invalid, and urgent suppressed", () => {
    // THF (0.9) <= expectedHF (0.95) → seized fraction raw < 0.
    const result = calculate(makeParams([v(1.0)], { THF: 0.9 }));
    const weird = getWarning(result.warnings, "weird-params");
    expect(weird).toBeDefined();
    expect(weird?.tone).toBe("soft");
    expect(hasWarning(result.warnings, "urgent")).toBe(false);
  });

  it("weird-params — soft tone when seized fraction would exceed 100%", () => {
    // CF=0.95, THF=1.5 → seized fraction raw > 1.
    const result = calculate(makeParams([v(1.0)], { CF: 0.95, THF: 1.5 }));
    const weird = getWarning(result.warnings, "weird-params");
    expect(weird).toBeDefined();
    expect(weird?.tone).toBe("soft");
  });

  it("weird-params — never suggests a reorder under invalid params", () => {
    // Suboptimal order [small, big] that would normally suggest a reorder,
    // but invalid params (THF <= expectedHF) suppress the suggestion.
    const result = calculate(makeParams([v(0.35), v(0.65)], { THF: 0.9 }));
    expect(hasWarning(result.warnings, "weird-params")).toBe(true);
    expect(result.optimalVaultOrder).toBeNull();
  });

  // ── Group breakdown uses the current on-chain order ──────────

  it("group breakdown follows the current order, not the optimal one", () => {
    // [0.35, 0.65] in this order: 0.35 alone can't cover the target, so both
    // vaults are seized together in one event (a worse outcome the user keeps
    // until they apply the optimal order).
    const result = calculate(makeParams([v(0.35), v(0.65)]));
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].vaults).toHaveLength(2);
  });

  // ── Optimal order ──────────────────────────────────────────

  it("suggests a better order when the current order is suboptimal", () => {
    const result = calculate(makeParams([v(0.35), v(0.65)]));
    expect(result.optimalVaultOrder).not.toBeNull();
    // Largest vault first protects more collateral.
    expect(result.optimalVaultOrder![0].btc).toBeCloseTo(0.65, 2);
  });

  it("suggests nothing when the current order is already optimal", () => {
    const result = calculate(makeParams([v(0.65), v(0.35)]));
    expect(result.optimalVaultOrder).toBeNull();
  });

  // ── Robustness ───────────────────────────────────────────────

  it("handles a large in-cap position (14 vaults, exact DP) without throwing", () => {
    const vaults = Array.from({ length: 14 }, (_, i) => v(0.1 + i * 0.03));
    const result = calculate(makeParams(vaults));
    expect(result.groups.length).toBeGreaterThan(0);
    expect(result.optimalVaultOrder ?? vaults).toHaveLength(14);
  });

  it("only emits known warning types", () => {
    const inputs: Vault[][] = [
      [v(1.0)],
      [v(0.35), v(0.65)],
      [v(0.1), v(0.1), v(0.8)],
      [v(2.0), v(1.0), v(0.5)],
    ];
    const allowed = new Set([
      "urgent",
      "cliff",
      "reorder",
      "dust",
      "weird-params",
      "too-many-vaults",
    ]);
    for (const vaults of inputs) {
      const result = calculate(makeParams(vaults));
      for (const w of result.warnings) {
        expect(allowed.has(w.type)).toBe(true);
      }
    }
  });
});

describe("bannerSeverity", () => {
  it("green when no warnings and the order is already optimal", () => {
    const result = calculate(makeParams([v(2.0), v(1.0)]));
    const state = deriveBannerState(result);
    expect(state.severity).toBe("green");
    expect(state.suggestReorder).toBe(false);
  });

  it("red for an urgent warning", () => {
    const result = calculate(makeParams([v(1.0)], { totalDebtUsd: 50000 }));
    const state = deriveBannerState(result);
    expect(state.severity).toBe("red");
    expect(state.primaryWarning?.type).toBe("urgent");
  });

  it("hidden for dust — suppresses other warnings", () => {
    const result = calculate(makeParams([v(0.5)], { totalDebtUsd: 500 }));
    const state = deriveBannerState(result);
    expect(state.severity).toBe("hidden");
    expect(state.primaryWarning).toBeNull();
    expect(state.secondaryWarnings).toHaveLength(0);
  });

  it("hidden when there are no groups (zero debt)", () => {
    const result = calculate(makeParams([v(1.0)], { totalDebtUsd: 0 }));
    expect(deriveBannerState(result).severity).toBe("hidden");
  });

  it("yellow (orange) when a cliff is the primary warning", () => {
    // Single 2.0 BTC vault: cliff but far from liquidation (no urgent), so the
    // cliff is primary and renders as the orange warning per Figma.
    const result = calculate(makeParams([v(2.0)]));
    const state = deriveBannerState(result);
    expect(state.primaryWarning?.type).toBe("cliff");
    expect(state.severity).toBe("yellow");
  });

  it("soft for a weird-params advisory", () => {
    const result = calculate(makeParams([v(1.0)], { THF: 0.9 }));
    const state = deriveBannerState(result);
    expect(state.severity).toBe("soft");
    expect(state.primaryWarning?.type).toBe("weird-params");
  });

  it("soft with a reorder warning as primary for a suboptimal position", () => {
    const result = calculate(makeParams([v(1.0), v(2.0)]));
    const state = deriveBannerState(result);
    expect(state.severity).toBe("soft");
    expect(state.primaryWarning?.type).toBe("reorder");
    expect(state.suggestReorder).toBe(true);
  });
});

// Golden vectors ported from the reference calculator's scenario suite
// (tbv-liquidations, the source of truth). Defaults match the reference:
// debt 44287.72, BTC $61722.5, CF 0.75, THF 1.10, LB 1.05, expectedHF 0.95.
// Behavior (warning types, group structure, suggested amounts) is asserted with
// our copy strings — which intentionally differ from the reference only for the
// `urgent` titles. Suggested vault sizes drop the reference's 5% buffer, which
// the split risk model removed (babylon-toolkit#2577).
describe("golden vectors (reference scenario suite)", () => {
  it("A1 — single 1.0 BTC: affordable cliff (add sacrificial) + urgent within 5%", () => {
    const result = calculate(makeParams([v(1.0)]));
    expect(getWarning(result.warnings, "cliff")?.title).toBe(
      "First liquidation takes everything",
    );
    expect(hasWarning(result.warnings, "urgent")).toBe(true);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].isFullLiquidation).toBe(true);
    // Affordable add (≤ position) → Variant A: sacrificial vault to add so the
    // existing vault becomes protected.
    // 1.0 × 0.3979 / (1 − 0.3979) = 0.66084, rounded up to 0.0001 BTC
    expect(result.suggestedNewVaultBtc).toBe(0.6609);
    expect(getWarning(result.warnings, "cliff")?.suggestion).toContain(
      "Adding a new BTCVault of 0.6609 BTC enables partial-position liquidation.",
    );
  });

  it("A8 — single 2.0 BTC, THF 1.40: no affordable add → add collateral or repay, never a re-split", () => {
    const result = calculate(makeParams([v(2.0)], { THF: 1.4 }));
    const cliff = getWarning(result.warnings, "cliff");
    expect(cliff?.title).toBe("First liquidation takes everything");
    // Seized fraction ≈ 0.609: the add would be 3.12 BTC, more than the 2.0 BTC
    // position, and re-depositing as two vaults would put the larger vault
    // first — a split the deposit form refuses. Only collateral or repay helps.
    expect(result.suggestedNewVaultBtc).toBeNull();
    expect(cliff?.suggestion).toBe(
      COPY.liquidationWarnings.cliff.noSplitSuggestion,
    );
    expect(cliff?.suggestion).not.toContain("withdraw");
  });

  it("A9 — small position at CF 86%: the add fits because it is rounded to 0.0001 BTC, not to cents", () => {
    // Launch split parameters. 0.0395 BTC × 0.4649 / (1 − 0.4649) = 0.03431 BTC.
    // Rounded up to cents that is 0.04 BTC, more than the position.
    const result = calculate({
      btcPrice: 60_000,
      totalDebtUsd: 1_500,
      vaults: [v(0.0395)],
      CF: 0.86,
      THF: 1.08,
      LB: 1.0504,
      bonusCurve: LAUNCH_BONUS_CURVE,
      expectedHF: 0.99,
      minPeginBtc: 0.0005,
    });

    expect(result.suggestedNewVaultBtc).toBe(0.0344);
    expect(getWarning(result.warnings, "cliff")?.suggestion).toContain(
      "Adding a new BTCVault of 0.0344 BTC",
    );
  });

  it("raises the suggested vault to the minimum peg-in so the deposit form accepts it", () => {
    // Launch split parameters at CF 78%: 0.1 BTC × 0.2857 / (1 − 0.2857) = 0.04 BTC,
    // below the 0.0546 BTC minimum peg-in. A bigger first vault still covers
    // the seizure.
    const result = calculate({
      btcPrice: 60_000,
      totalDebtUsd: 3_000,
      vaults: [v(0.1)],
      CF: 0.78,
      THF: 1.08,
      LB: 1.0504,
      bonusCurve: LAUNCH_BONUS_CURVE,
      expectedHF: 0.99,
      minPeginBtc: 0.0546,
    });

    expect(result.suggestedNewVaultBtc).toBe(0.0546);
    expect(getWarning(result.warnings, "cliff")?.suggestion).toContain(
      "Adding a new BTCVault of 0.0546 BTC",
    );
  });

  it("falls back to add collateral or repay when even the minimum peg-in exceeds the position", () => {
    const result = calculate({
      btcPrice: 60_000,
      totalDebtUsd: 1_500,
      vaults: [v(0.05)],
      CF: 0.78,
      THF: 1.08,
      LB: 1.0504,
      bonusCurve: LAUNCH_BONUS_CURVE,
      expectedHF: 0.99,
      minPeginBtc: 0.0546,
    });

    expect(result.suggestedNewVaultBtc).toBeNull();
    // The minimum peg-in is larger than the whole position, so the advice
    // names the size rather than the protocol parameters — splitting works
    // fine here at a seized fraction of ~0.29.
    expect(getWarning(result.warnings, "cliff")?.suggestion).toBe(
      COPY.liquidationWarnings.cliff.tooSmallToSplitSuggestion("0.0546"),
    );
  });

  it("does not suggest a new vault as large as the existing one", () => {
    // 0.0546 BTC × 0.2857 / (1 − 0.2857) = 0.0218 BTC, floored to the 0.0546 BTC
    // minimum: the new first vault would equal the existing vault.
    const result = calculate({
      btcPrice: 60_000,
      totalDebtUsd: 1_500,
      vaults: [v(0.0546)],
      CF: 0.78,
      THF: 1.08,
      LB: 1.0504,
      bonusCurve: LAUNCH_BONUS_CURVE,
      expectedHF: 0.99,
      minPeginBtc: 0.0546,
    });

    expect(result.suggestedNewVaultBtc).toBeNull();
    // Unfloored the add would be 0.0218 BTC, comfortably smaller than the
    // vault, so only the minimum peg-in blocks the split: the position is too
    // small, not badly parameterised.
    expect(getWarning(result.warnings, "cliff")?.suggestion).toBe(
      COPY.liquidationWarnings.cliff.tooSmallToSplitSuggestion("0.0546"),
    );
  });

  // The next two need a seized fraction just under one half, which takes a
  // collateral factor of about 87% — above the 86% the protocol contemplates.
  // Below that the 0.0001 BTC round-up can never be what blocks the split, so
  // this is the only configuration that exercises the branch at all.
  it("quotes the rounded-up requirement, not the minimum, when the round-up is what blocks the split", () => {
    // Seized fraction ≈ 0.4993, so the add is 0.019941 BTC — smaller than the
    // vault until the round-up lifts it to exactly 0.02. The minimum peg-in
    // is 40× smaller than the vault, so quoting it would claim an amount that
    // plainly is smaller and contradict the sentence.
    const result = calculate({
      btcPrice: 60_000,
      totalDebtUsd: 1_500,
      vaults: [v(0.02)],
      CF: 0.8698,
      THF: 1.08,
      LB: 1.0504,
      bonusCurve: LAUNCH_BONUS_CURVE,
      expectedHF: 0.99,
      minPeginBtc: 0.0005,
    });

    expect(result.suggestedNewVaultBtc).toBeNull();
    expect(getWarning(result.warnings, "cliff")?.suggestion).toBe(
      COPY.liquidationWarnings.cliff.tooSmallToSplitSuggestion("0.02"),
    );
  });

  it("never quotes a zero requirement when the minimum peg-in could not be read", () => {
    // A null minimum leaves no floor, so the round-up alone decides. Quoting
    // the floor here would render "at least 0 BTC".
    const result = calculate({
      btcPrice: 60_000,
      totalDebtUsd: 1_500,
      vaults: [v(0.02)],
      CF: 0.8698,
      THF: 1.08,
      LB: 1.0504,
      bonusCurve: LAUNCH_BONUS_CURVE,
      expectedHF: 0.99,
      minPeginBtc: null,
    });

    expect(result.suggestedNewVaultBtc).toBeNull();
    expect(getWarning(result.warnings, "cliff")?.suggestion).toBe(
      COPY.liquidationWarnings.cliff.tooSmallToSplitSuggestion("0.02"),
    );
  });

  it("blames the protocol parameters when no deposit size could make the added vault smaller", () => {
    // Seized fraction ≥ 0.5, so the sacrificial vault would have to be at
    // least as large as the existing one at any position size — the opposite
    // cause from the two cases above, and it must keep its own copy.
    const result = calculate({
      btcPrice: 60_000,
      totalDebtUsd: 1_500,
      vaults: [v(0.5)],
      CF: 0.9,
      THF: 1.08,
      LB: 1.0504,
      bonusCurve: LAUNCH_BONUS_CURVE,
      expectedHF: 0.99,
      minPeginBtc: 0.0005,
    });

    expect(result.suggestedNewVaultBtc).toBeNull();
    expect(getWarning(result.warnings, "cliff")?.suggestion).toBe(
      COPY.liquidationWarnings.cliff.noSplitSuggestion,
    );
  });

  it("floors the two-vault 'add alongside' amount at the minimum peg-in", () => {
    // THF 1.40: seized fraction ≈ 0.609, so neither 1.0 BTC vault covers the
    // 1.218 BTC target. The deficit is 0.5577 BTC, below a 0.6 BTC minimum.
    const result = calculate(
      makeParams([v(1.0), v(1.0)], { THF: 1.4, minPeginBtc: 0.6 }),
    );

    expect(getWarning(result.warnings, "cliff")?.suggestion).toContain(
      "add ≥ 0.6 BTC alongside",
    );
  });

  it("uses the unfloored suggestion when the peg-in configuration is unavailable", () => {
    // Same position as the minimum-peg-in test above: 0.0401 BTC unfloored,
    // 0.0546 BTC with the minimum. A fallback to a realistic minimum would
    // change the result.
    const result = calculate({
      btcPrice: 60_000,
      totalDebtUsd: 3_000,
      vaults: [v(0.1)],
      CF: 0.78,
      THF: 1.08,
      LB: 1.0504,
      bonusCurve: LAUNCH_BONUS_CURVE,
      expectedHF: 0.99,
      minPeginBtc: null,
    });

    expect(result.suggestedNewVaultBtc).toBe(0.0401);
  });

  it("A2 — single 2.0 BTC: cliff only, no urgent (far from liquidation)", () => {
    const result = calculate(makeParams([v(2.0)]));
    expect(hasWarning(result.warnings, "cliff")).toBe(true);
    expect(hasWarning(result.warnings, "urgent")).toBe(false);
  });

  it("A7 — single 1.0 BTC, HF < 1: cliff + already-liquidatable urgent", () => {
    const result = calculate(makeParams([v(1.0)], { totalDebtUsd: 50000 }));
    expect(hasWarning(result.warnings, "cliff")).toBe(true);
    expect(getWarning(result.warnings, "urgent")?.title).toBe(
      "Liquidation can trigger now",
    );
  });

  it("B1 — [0.65, 0.35] correct order: no cliff/reorder, 2 groups", () => {
    const result = calculate(makeParams([v(0.65), v(0.35)]));
    expect(hasWarning(result.warnings, "cliff")).toBe(false);
    expect(hasWarning(result.warnings, "reorder")).toBe(false);
    expect(result.groups).toHaveLength(2);
    expect(result.groups[0].vaults).toHaveLength(1);
    expect(result.groups[1].isFullLiquidation).toBe(true);
  });

  it("B2 — [0.80, 0.20]: over-seizure is no longer surfaced (rebalance dropped)", () => {
    // The first group over-seizes, but with the "Undersized sacrificial vault"
    // (rebalance) notification removed there is no actionable cliff/reorder
    // warning for this shape — the position is left un-notified by design.
    const result = calculate(makeParams([v(0.8), v(0.2)]));
    expect(hasWarning(result.warnings, "cliff")).toBe(false);
    expect(hasWarning(result.warnings, "reorder")).toBe(false);
  });

  it("C1 — [0.35, 0.65] wrong order: reorder notification, single group", () => {
    const result = calculate(makeParams([v(0.35), v(0.65)]));
    const reorder = getWarning(result.warnings, "reorder");
    expect(reorder?.title).toBe("Reorder BTCVaults to lose less");
    expect(result.optimalVaultOrder).not.toBeNull();
    expect(result.groups).toHaveLength(1);
  });

  it("C2 — [0.20, 0.80] cliff fixable by reorder (anti-loop exempt for cliff)", () => {
    const result = calculate(makeParams([v(0.2), v(0.8)]));
    expect(hasWarning(result.warnings, "reorder")).toBe(true);
    expect(result.optimalVaultOrder).not.toBeNull();
  });

  it("D1 — THF 1.30 [0.50, 0.50]: true cliff, neither vault covers", () => {
    const result = calculate(makeParams([v(0.5), v(0.5)], { THF: 1.3 }));
    const cliff = getWarning(result.warnings, "cliff");
    expect(cliff?.title).toBe("First liquidation takes everything");
    // The deficit detail moved into the suggestion now that the body is shared.
    expect(cliff?.suggestion).toContain("Neither BTCVault");
    expect(hasWarning(result.warnings, "reorder")).toBe(false);
    expect(result.groups).toHaveLength(1);
  });

  it("E1 — [0.42, 0.29, 0.29]: optimally structured, 3 events, no warnings", () => {
    const result = calculate(makeParams([v(0.42), v(0.29), v(0.29)]));
    expect(hasWarning(result.warnings, "cliff")).toBe(false);
    expect(hasWarning(result.warnings, "reorder")).toBe(false);
    expect(result.groups).toHaveLength(3);
    expect(result.groups[2].isFullLiquidation).toBe(true);
  });

  it("G2 — [0.10, 0.10, 0.35] cliff fixable by reorder", () => {
    // Above its $107,364 trigger: a reorder can't run below it.
    const result = calculate(
      makeParams([v(0.1), v(0.1), v(0.35)], { btcPrice: 120_000 }),
    );
    const cliff = getWarning(result.warnings, "cliff");
    expect(cliff?.title).toBe("First liquidation takes everything");
    expect(cliff?.suggestion).toContain("Reordering");
    expect(result.groups).toHaveLength(1);
  });

  it("M1 — [0.3979, 0.6021] vault exactly at target: no cliff (within tolerance)", () => {
    const result = calculate(makeParams([v(0.3979), v(0.6021)]));
    expect(hasWarning(result.warnings, "cliff")).toBe(false);
  });

  it("M5 — single vault, zero debt: no warnings, no groups", () => {
    const result = calculate(makeParams([v(1.0)], { totalDebtUsd: 0 }));
    expect(result.warnings).toHaveLength(0);
    expect(result.groups).toHaveLength(0);
    expect(result.currentHF).toBe(Infinity);
  });

  it("18 vaults: too-many-vaults warning, no optimal order suggested", () => {
    const vaults = Array.from({ length: 18 }, (_, idx) => v(0.2 + idx * 0.01));
    const result = calculate(makeParams(vaults));
    expect(getWarning(result.warnings, "too-many-vaults")?.title).toContain(
      "Too many BTCVaults",
    );
    expect(result.optimalVaultOrder).toBeNull();
  });

  it("17 vaults at the cap: no too-many-vaults warning (== MAX_DP_N)", () => {
    // The position has 17 vaults (== MAX_DP_N), so the optimizer runs an exact
    // DP and does NOT fall back — no too-many-vaults warning fires (the position
    // is at the cap, not over it).
    const big = v(0.9);
    const smalls = Array.from({ length: 16 }, () => v(0.01));
    const result = calculate(makeParams([big, ...smalls]));

    expect(hasWarning(result.warnings, "too-many-vaults")).toBe(false);
    // The optimal-order analysis runs an exact DP at n = 17 (the cap), which is
    // intentionally near the interactive-time budget — allow extra headroom.
  }, 20000);
});

// The deposit form and this calculator must size seizures with the same
// inputs. If they drift (a leftover buffer, or the max bonus instead of the
// bonus at the expected HF), a fresh split's first BTCVault falls short of the
// calculator's target and every new two-vault position shows a cliff warning.
describe("consistency with the deposit split", () => {
  const SATS_PER_BTC = 100_000_000;
  // Bonus at HF 0.99 on the launch curve (max 105.55%, factor 90%, max at HF 0.90)
  const LAUNCH_LB = 1.0504;

  it.each([0.78, 0.86])("keeps the second BTCVault at CF %s", (CF) => {
    const params = {
      CF,
      LB: LAUNCH_LB,
      bonusCurve: LAUNCH_BONUS_CURVE,
      THF: SPLIT_TARGET_HEALTH_FACTOR,
      expectedHF: EXPECTED_HEALTH_FACTOR_AT_LIQUIDATION,
    };
    const split = computeOptimalSplit({
      totalBtc: 10n * BigInt(SATS_PER_BTC),
      ...params,
    });
    const first = v(Number(split.sacrificialVault) / SATS_PER_BTC);
    const splitResult = calculate(
      makeParams([first, v(Number(split.protectedVault) / SATS_PER_BTC)], {
        ...params,
        btcPrice: 60_000,
        totalDebtUsd: 390_000,
      }),
    );

    expect(hasWarning(splitResult.warnings, "cliff")).toBe(false);
    expect(splitResult.groups[0].vaults).toEqual([first]);

    // Use the BTC amounts, debt and simulated price from issue #2858.
    const reportedFirst = v(0.12016827);
    const reported = calculate(
      makeParams([reportedFirst, v(0.01)], {
        ...params,
        btcPrice: 1_017,
        totalDebtUsd: 103.4,
      }),
    );

    expect(reported.groups).toHaveLength(1);
    expect(reported.groups[0].vaults).toEqual([reportedFirst]);
    expect(reported.groups[0].isFullLiquidation).toBe(false);
    expect(reported.groups[0].debtRemainingAfter).toBe(0);
    expect(reported.groups[0].btcRemainingAfter).toBeCloseTo(0.01, 8);
  });
});

// Each trigger is the price where the remaining position reaches HF 1. These
// positions all start with 2 BTC against $100,000 at CF 0.75, so the first
// trigger is $66,666.67 and HF at a price is price / trigger.
describe("price already below the first trigger", () => {
  const GAP_PARAMS = {
    totalDebtUsd: 100_000,
    CF: 0.75,
    THF: 1.08,
    LB: 1.05,
    expectedHF: 0.99,
  };
  const FIRST_TRIGGER = 100_000 / (2 * 0.75);

  it("prices the seizure at the market price, not the trigger", () => {
    const { groups } = calculate(
      makeParams([v(0.5), v(0.5), v(1)], { ...GAP_PARAMS, btcPrice: 62_000 }),
    );

    expect(groups[0].liquidationPrice).toBeCloseTo(FIRST_TRIGGER, 6);
    expect(groups[0].executionPrice).toBe(62_000);
    expect(groups[0].debtRepaid).toBeCloseTo((1 * 62_000) / 1.05, 6);
    expect(groups[0].debtRemainingAfter).toBeCloseTo(
      100_000 - (1 * 62_000) / 1.05,
      6,
    );
  });

  it("reports the part of the repayment that over-seizure paid for", () => {
    const [group] = calculate(
      makeParams([v(0.5), v(0.5), v(1)], { ...GAP_PARAMS, btcPrice: 62_000 }),
    ).groups;

    expect(group.overSeizureBtc).toBeGreaterThan(0);
    expect(group.fairnessDebtRepay).toBeCloseTo(
      (group.overSeizureBtc * 62_000) / 1.05,
      6,
    );
    expect(group.debtToRepay + group.fairnessDebtRepay).toBeCloseTo(
      group.debtRepaid,
      6,
    );
  });

  it("seizes the next vault while the position is still liquidatable at the price", () => {
    // HF 0.93 before, 0.99 after the first vault, so the Spoke can seize again.
    const { groups } = calculate(
      makeParams([v(0.5), v(0.5), v(1)], { ...GAP_PARAMS, btcPrice: 62_000 }),
    );

    expect(groups[0].vaults.map((vault) => vault.btc)).toEqual([0.5, 0.5]);
    expect(groups[0].btcRemainingAfter).toBeCloseTo(1, 8);
  });

  it("stops at the vault that leaves the position healthy at the price", () => {
    // HF 0.96 before, 1.036 after the first vault: the Spoke would revert.
    const { groups } = calculate(
      makeParams([v(0.5), v(0.5), v(1)], { ...GAP_PARAMS, btcPrice: 64_000 }),
    );

    expect(groups[0].vaults.map((vault) => vault.btc)).toEqual([0.5]);
    expect(groups[1].liquidationPrice).toBeLessThan(64_000);
  });

  it("prices the events after the gap at their own triggers, from the debt the gap left", () => {
    const { groups } = calculate(
      makeParams([v(0.5), v(0.5), v(1)], { ...GAP_PARAMS, btcPrice: 62_000 }),
    );

    const debtAfterGap = 100_000 - (1 * 62_000) / 1.05;
    expect(groups[1].liquidationPrice).toBeCloseTo(
      debtAfterGap / (1 * 0.75),
      6,
    );
    expect(groups[1].executionPrice).toBe(groups[1].liquidationPrice);
  });

  it("pays the surplus to the borrower when a seizure clears the debt", () => {
    const { groups } = calculate(
      makeParams([v(0.5), v(0.5), v(1)], { ...GAP_PARAMS, btcPrice: 58_000 }),
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].vaults).toHaveLength(3);
    expect(groups[0].debtRepaid).toBeCloseTo(100_000, 6);
    expect(groups[0].debtRemainingAfter).toBe(0);
    expect(groups[0].fairnessPaymentUsd).toBeCloseTo(
      (2 * 58_000) / 1.05 - 100_000,
      6,
    );
    expect(groups[0].liquidatorProfitUsd).toBeCloseTo(
      2 * 58_000 - (2 * 58_000) / 1.05,
      6,
    );
  });

  it("writes off the debt the seized BTC can't cover", () => {
    const { groups } = calculate(
      makeParams([v(0.5), v(0.5), v(1)], { ...GAP_PARAMS, btcPrice: 50_000 }),
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].isFullLiquidation).toBe(true);
    expect(groups[0].debtRepaid).toBeCloseTo((2 * 50_000) / 1.05, 6);
    expect(groups[0].debtRemainingAfter).toBe(0);
    expect(groups[0].fairnessPaymentUsd).toBe(0);
  });

  it("leaves later vaults alone when an early seizure clears the debt", () => {
    const small = v(0.01);
    const { groups } = calculate(
      makeParams([v(0.12016827), small], {
        ...GAP_PARAMS,
        CF: 0.78,
        LB: 1.0504,
        bonusCurve: LAUNCH_BONUS_CURVE,
        btcPrice: 1_017,
        totalDebtUsd: 103.4,
      }),
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].isFullLiquidation).toBe(false);
    expect(groups[0].debtRemainingAfter).toBe(0);
    expect(groups[0].btcRemainingAfter).toBeCloseTo(small.btc, 8);
    expect(groups[0].fairnessPaymentUsd).toBeCloseTo(
      (0.12016827 * 1_017) / 1.0499 - 103.4,
      6,
    );
  });

  // A fixed 1.0504 repays enough to reach HF 1.0004 and stop with 1.5 BTC left.
  // The bonus at HF 0.948 is 1.0528, which only reaches HF 0.9995, so the Spoke
  // seizes the second vault too. That one reads 1.0499, at HF 0.9995.
  it("reads the bonus at the health factor before each seizure", () => {
    const { groups } = calculate(
      makeParams([v(0.5), v(0.5), v(1)], {
        ...GAP_PARAMS,
        CF: 0.78,
        LB: 1.0504,
        bonusCurve: LAUNCH_BONUS_CURVE,
        btcPrice: 60_770,
      }),
    );

    const vaultValueUsd = 0.5 * 60_770;
    expect(groups[0].vaults).toHaveLength(2);
    expect(groups[0].btcRemainingAfter).toBeCloseTo(1, 8);
    expect(groups[0].debtRemainingAfter).toBeCloseTo(
      100_000 - vaultValueUsd / 1.0528 - vaultValueUsd / 1.0499,
      6,
    );
  });

  it("uses the maximum bonus at or below the health factor it applies from", () => {
    // HF 0.624, and each seizure lowers it further: every call reads 105.55%.
    const { groups } = calculate(
      makeParams([v(0.5), v(0.5), v(1)], {
        ...GAP_PARAMS,
        CF: 0.78,
        LB: 1.0504,
        bonusCurve: LAUNCH_BONUS_CURVE,
        btcPrice: 40_000,
      }),
    );

    expect(groups[0].debtRepaid).toBeCloseTo((2 * 40_000) / 1.0555, 6);
  });

  it("leaves a group priced at its trigger to the fixed bonus", () => {
    const vaults = [v(0.5), v(0.5), v(1)];
    const atPrice = (bonusCurve: CalculatorParams["bonusCurve"]) =>
      calculate(
        makeParams(vaults, { ...GAP_PARAMS, btcPrice: 90_000, bonusCurve }),
      ).groups;

    expect(atPrice(LAUNCH_BONUS_CURVE)).toEqual(atPrice(FLAT_BONUS_CURVE));
  });

  it("splits the seizure into a target and an over-seizure that add up to it", () => {
    for (const btcPrice of [66_000, 64_000, 62_000, 58_000, 50_000]) {
      const [group] = calculate(
        makeParams([v(0.3), v(0.7), v(1)], { ...GAP_PARAMS, btcPrice }),
      ).groups;

      expect(group.targetSeizureBtc).toBeLessThanOrEqual(group.combinedBtc);
      expect(group.overSeizureBtc).toBeGreaterThanOrEqual(0);
      expect(group.targetSeizureBtc + group.overSeizureBtc).toBeCloseTo(
        group.combinedBtc,
        8,
      );
    }
  });

  // The Timeline's price scale throws on triggers that aren't strictly
  // descending, which would take the whole page down.
  it("keeps triggers strictly descending, with only the first event gapped", () => {
    const orders = [
      [0.5, 0.5, 1],
      [1, 0.5, 0.5],
      [0.1, 0.9, 1],
      [0.3, 0.3, 0.3, 0.3, 0.8],
      [0.05, 0.05, 0.05, 1.85],
    ];
    for (const btcs of orders) {
      for (let share = 1; share >= 0.4; share -= 0.01) {
        const btcPrice = FIRST_TRIGGER * share;
        const { groups } = calculate(
          makeParams(btcs.map(v), { ...GAP_PARAMS, btcPrice }),
        );

        for (const [i, group] of groups.entries()) {
          if (i > 0) {
            expect(group.liquidationPrice).toBeLessThan(
              groups[i - 1].liquidationPrice,
            );
            expect(group.executionPrice).toBe(group.liquidationPrice);
          }
        }
      }
    }
  });

  it("changes nothing but the distance while the price is at or above the trigger", () => {
    const vaults = [v(0.5), v(0.5), v(1)];
    const params = { ...GAP_PARAMS, totalDebtUsd: 75_000 };
    // 2 BTC against $75,000 at CF 0.75: HF is exactly 1 at $50,000.
    const atTrigger = calculate(
      makeParams(vaults, { ...params, btcPrice: 50_000 }),
    );
    const aboveTrigger = calculate(
      makeParams(vaults, { ...params, btcPrice: 90_000 }),
    );

    expect(atTrigger.groups[0].executionPrice).toBe(50_000);
    expect(atTrigger.groups).toEqual(
      aboveTrigger.groups.map((group, i) => ({
        ...group,
        distancePct: atTrigger.groups[i].distancePct,
      })),
    );
  });

  // The signing guard re-runs the calculator and compares this order.
  it("keeps the optimal order below the trigger, without the advice to apply it", () => {
    const vaults = [v(1), v(0.5), v(0.5)];
    const above = calculate(
      makeParams(vaults, { ...GAP_PARAMS, btcPrice: 70_000 }),
    );
    const below = calculate(
      makeParams(vaults, { ...GAP_PARAMS, btcPrice: 50_000 }),
    );

    expect(above.optimalVaultOrder).not.toBeNull();
    expect(below.optimalVaultOrder).toEqual(above.optimalVaultOrder);
    expect(hasWarning(above.warnings, "reorder")).toBe(true);
    expect(hasWarning(below.warnings, "reorder")).toBe(false);
  });

  // `reorderVaults` reverts below HF 1, and at this price 0.3 BTC is what goes
  // first: the suggested order would seize 0.7.
  it("drops the reorder warning on two vaults below the trigger", () => {
    const { warnings, groups } = calculate(
      makeParams([v(0.3), v(0.7)], {
        totalDebtUsd: 100_000,
        btcPrice: 132_000,
      }),
    );

    expect(groups[0].vaults).toHaveLength(1);
    expect(hasWarning(warnings, "reorder")).toBe(false);
    expect(hasWarning(warnings, "cliff")).toBe(false);
    expect(hasWarning(warnings, "urgent")).toBe(true);
  });

  it("stops suggesting a reorder to the banner below the trigger", () => {
    const vaults = [v(1), v(0.5), v(0.5)];
    const above = calculate(
      makeParams(vaults, { ...GAP_PARAMS, btcPrice: 70_000 }),
    );
    const below = calculate(
      makeParams(vaults, { ...GAP_PARAMS, btcPrice: 50_000 }),
    );

    expect(deriveBannerState(above).suggestReorder).toBe(true);
    expect(deriveBannerState(below).suggestReorder).toBe(false);
  });

  // The reading for a position the Spoke itself reads as healthy.
  it("keeps every event at its own trigger below the trigger in the gradual reading", () => {
    const vaults = [v(0.5), v(0.5), v(1)];
    const params = makeParams(vaults, { ...GAP_PARAMS, btcPrice: 50_000 });
    const above = calculate(
      makeParams(vaults, { ...GAP_PARAMS, btcPrice: 70_000 }),
    );

    const gradual = calculate(params, "gradual");

    expect(gradual.groups).toEqual(
      withDistancesAt(above, params.btcPrice).groups,
    );
  });

  it("measures the gradual reading's distances to the live price", () => {
    const { groups } = calculate(
      makeParams([v(1)], {
        ...GAP_PARAMS,
        btcPrice: 50_000,
        totalDebtUsd: 75_000,
      }),
      "gradual",
    );

    // A $100,000 trigger, at 0.75 CF, is 100% above $50,000.
    expect(groups[0].liquidationPrice).toBeCloseTo(100_000);
    expect(groups[0].distancePct).toBeCloseTo(100);
  });

  it("gives the reorder advice in the gradual reading, which the live one leaves out", () => {
    const params = makeParams([v(1), v(0.5), v(0.5)], {
      ...GAP_PARAMS,
      btcPrice: 50_000,
    });

    expect(hasWarning(calculate(params).warnings, "reorder")).toBe(false);
    expect(hasWarning(calculate(params, "gradual").warnings, "reorder")).toBe(
      true,
    );
  });

  it("leaves out the gapped cliff in the gradual reading", () => {
    const params = makeParams([v(0.5), v(0.5), v(1)], {
      ...GAP_PARAMS,
      btcPrice: 50_000,
    });

    expect(hasWarning(calculate(params).warnings, "cliff")).toBe(true);
    expect(hasWarning(calculate(params, "gradual").warnings, "cliff")).toBe(
      false,
    );
  });

  // `assertOptimalOrderMatchesOnChain` compares the order against the live
  // reading before signing.
  it("suggests the same order in the gradual and live readings", () => {
    const params = makeParams([v(1), v(0.5), v(0.5)], {
      ...GAP_PARAMS,
      btcPrice: 50_000,
    });
    const live = calculate(params);

    expect(live.optimalVaultOrder).not.toBeNull();
    expect(calculate(params, "gradual").optimalVaultOrder).toEqual(
      live.optimalVaultOrder,
    );
  });

  it("warns of the cliff when a gap takes every vault, even where the path group would not", () => {
    const vaults = [v(0.5), v(0.5), v(1)];
    const above = calculate(
      makeParams(vaults, { ...GAP_PARAMS, btcPrice: 70_000 }),
    );
    const below = calculate(
      makeParams(vaults, { ...GAP_PARAMS, btcPrice: 50_000 }),
    );

    expect(hasWarning(above.warnings, "cliff")).toBe(false);
    expect(below.groups[0].vaults).toHaveLength(3);
    expect(getWarning(below.warnings, "cliff")?.suggestion).toBe(
      COPY.liquidationWarnings.cliff.gappedSuggestion(3),
    );
  });

  // 0.1, 0.1 and 0.8 BTC at the default params: the path's first group takes
  // every vault. At HF 0.99 the first seizure already lifts the position over 1.
  it("drops the cliff warning when the first event stops short of every vault", () => {
    const vaults = [v(0.1), v(0.1), v(0.8)];
    const above = calculate(
      makeParams(vaults, { totalDebtUsd: 100_000, btcPrice: 160_000 }),
    );
    const below = calculate(
      makeParams(vaults, { totalDebtUsd: 100_000, btcPrice: 132_000 }),
    );

    expect(hasWarning(above.warnings, "cliff")).toBe(true);
    expect(below.groups[0].vaults).toHaveLength(1);
    expect(hasWarning(below.warnings, "cliff")).toBe(false);
    expect(hasWarning(below.warnings, "reorder")).toBe(false);
    expect(hasWarning(below.warnings, "urgent")).toBe(true);
    expect(below.optimalVaultOrder).toEqual(above.optimalVaultOrder);
  });

  // Every vault goes in either order here, so "reordering will fix this" and "no
  // combination covers the target" would both be false.
  it("warns of the cliff without a reorder when the gapped first event takes every vault", () => {
    const below = calculate(
      makeParams([v(0.1), v(0.1), v(0.8)], {
        totalDebtUsd: 100_000,
        btcPrice: 90_000,
      }),
    );

    expect(below.groups[0].vaults).toHaveLength(3);
    expect(getWarning(below.warnings, "cliff")?.suggestion).toBe(
      COPY.liquidationWarnings.cliff.gappedSuggestion(3),
    );
  });

  it("warns of the cliff the same way on two vaults when both go", () => {
    const below = calculate(
      makeParams([v(0.3), v(0.7)], { totalDebtUsd: 100_000, btcPrice: 90_000 }),
    );

    expect(below.groups[0].vaults).toHaveLength(2);
    expect(getWarning(below.warnings, "cliff")?.suggestion).toBe(
      COPY.liquidationWarnings.cliff.gappedSuggestion(2),
    );
    expect(hasWarning(below.warnings, "reorder")).toBe(false);
  });

  it("keeps the add-a-vault advice on a single vault below the trigger", () => {
    const below = calculate(
      makeParams([v(1)], { totalDebtUsd: 100_000, btcPrice: 90_000 }),
    );

    expect(getWarning(below.warnings, "cliff")?.suggestion).not.toBe(
      COPY.liquidationWarnings.cliff.gappedSuggestion(1),
    );
    expect(below.suggestedNewVaultBtc).not.toBeNull();
  });

  it("still warns that the position is liquidatable at the first trigger", () => {
    const { warnings, groups } = calculate(
      makeParams([v(0.5), v(0.5), v(1)], { ...GAP_PARAMS, btcPrice: 50_000 }),
    );

    expect(groups[0].distancePct).toBeCloseTo(
      ((FIRST_TRIGGER - 50_000) / 50_000) * 100,
      6,
    );
    expect(getWarning(warnings, "urgent")?.title).toBe(
      COPY.liquidationWarnings.urgent.liquidatableTitle,
    );
  });

  it.each([0, Number.NaN, Number.POSITIVE_INFINITY])(
    "doesn't throw at a price of %s",
    (btcPrice) => {
      const { groups } = calculate(
        makeParams([v(0.5), v(0.5), v(1)], { ...GAP_PARAMS, btcPrice }),
      );

      expect(groups.length).toBeGreaterThan(0);
    },
  );
});

describe("withDistancesAt", () => {
  it("moves only the distances, leaving every event priced as it was", () => {
    const result = calculate(
      makeParams([v(0.5), v(0.5), v(1)], {
        totalDebtUsd: 100_000,
        CF: 0.75,
        THF: 1.08,
        LB: 1.05,
        expectedHF: 0.99,
        btcPrice: 90_000,
      }),
    );

    const read = withDistancesAt(result, 50_000);

    expect(read.groups).toEqual(
      result.groups.map((group) => ({
        ...group,
        distancePct: ((group.liquidationPrice - 50_000) / 50_000) * 100,
      })),
    );
    expect(read.warnings).toBe(result.warnings);
  });
});
