import { computeSeizedFractionDetailed } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import { beforeEach, describe, expect, it } from "vitest";

import { deriveBannerState } from "../bannerSeverity";
import { calculate } from "../calculate";
import type { CalculatorParams, Vault, Warning } from "../types";

// ── Helpers ──────────────────────────────────────────────────────

const DEFAULT_DEBT = 44287.72;
const DEFAULT_BTC_PRICE = 61722.5;
const DEFAULT_CF = 0.75;
const DEFAULT_THF = 1.1;
const DEFAULT_LB = 1.05;
const DEFAULT_EHF = 0.95;

let vaultCounter = 0;
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
    maxLB: DEFAULT_LB,
    expectedHF: DEFAULT_EHF,
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
    expect(result.suggestedVaultOrder).toBeNull();
  });

  it("dust — debt under $1k — single dust warning, one full-liquidation group", () => {
    const result = calculate(makeParams([v(0.5)], { totalDebtUsd: 500 }));
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].type).toBe("dust");
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].isFullLiquidation).toBe(true);
    expect(result.suggestedVaultOrder).toBeNull();
  });

  it("dust — collateral under $1k", () => {
    const result = calculate(makeParams([v(0.00001)]));
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].type).toBe("dust");
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
    expect(result.suggestedVaultOrder).toBeNull();
  });

  // ── Group breakdown uses the current on-chain order ──────────

  it("group breakdown follows the current order, not the optimal one", () => {
    // [0.35, 0.65] in this order: 0.35 alone can't cover the target, so both
    // vaults are seized together in one event (a worse outcome the user keeps
    // until they apply the suggested order).
    const result = calculate(makeParams([v(0.35), v(0.65)]));
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].vaults).toHaveLength(2);
  });

  // ── Suggested order ──────────────────────────────────────────

  it("suggests a better order when the current order is suboptimal", () => {
    const result = calculate(makeParams([v(0.35), v(0.65)]));
    expect(result.suggestedVaultOrder).not.toBeNull();
    // Largest vault first protects more collateral.
    expect(result.suggestedVaultOrder![0].btc).toBeCloseTo(0.65, 2);
  });

  it("suggests nothing when the current order is already optimal", () => {
    const result = calculate(makeParams([v(0.65), v(0.35)]));
    expect(result.suggestedVaultOrder).toBeNull();
  });

  // ── Robustness ───────────────────────────────────────────────

  it("handles more vaults than the optimizer DP cap without throwing", () => {
    const vaults = Array.from({ length: 14 }, (_, i) => v(0.1 + i * 0.03));
    const result = calculate(makeParams(vaults));
    expect(result.groups.length).toBeGreaterThan(0);
    expect(result.suggestedVaultOrder ?? vaults).toHaveLength(14);
  });

  it("only ever emits urgent / dust / weird-params", () => {
    const inputs: Vault[][] = [
      [v(1.0)],
      [v(0.35), v(0.65)],
      [v(0.1), v(0.1), v(0.8)],
      [v(2.0), v(1.0), v(0.5)],
    ];
    const allowed = new Set(["urgent", "dust", "weird-params"]);
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

  it("hidden for dust", () => {
    const result = calculate(makeParams([v(0.5)], { totalDebtUsd: 500 }));
    const state = deriveBannerState(result);
    expect(state.severity).toBe("hidden");
    expect(state.primaryWarning?.type).toBe("dust");
  });

  it("hidden when there are no groups (zero debt)", () => {
    const result = calculate(makeParams([v(1.0)], { totalDebtUsd: 0 }));
    expect(deriveBannerState(result).severity).toBe("hidden");
  });

  it("soft for a weird-params advisory", () => {
    const result = calculate(makeParams([v(1.0)], { THF: 0.9 }));
    const state = deriveBannerState(result);
    expect(state.severity).toBe("soft");
    expect(state.primaryWarning?.type).toBe("weird-params");
  });

  it("soft with a reorder suggestion for a healthy but suboptimal position", () => {
    const result = calculate(makeParams([v(1.0), v(2.0)]));
    const state = deriveBannerState(result);
    expect(state.severity).toBe("soft");
    expect(state.primaryWarning).toBeNull();
    expect(state.suggestReorder).toBe(true);
  });
});
