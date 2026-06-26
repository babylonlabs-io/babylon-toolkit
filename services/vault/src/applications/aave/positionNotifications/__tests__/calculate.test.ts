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
    expect(result.optimalVaultOrder).toBeNull();
  });

  it("dust — debt under $1k — single dust warning, one full-liquidation group", () => {
    const result = calculate(makeParams([v(0.5)], { totalDebtUsd: 500 }));
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].type).toBe("dust");
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].isFullLiquidation).toBe(true);
    expect(result.optimalVaultOrder).toBeNull();
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
      "rebalance",
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

  it("soft with a reorder warning as primary for a suboptimal position", () => {
    const result = calculate(makeParams([v(1.0), v(2.0)]));
    const state = deriveBannerState(result);
    expect(state.severity).toBe("soft");
    expect(state.primaryWarning?.type).toBe("reorder");
    expect(state.suggestReorder).toBe(true);
  });
});

describe("max-vaults banner severity", () => {
  // `max-vaults` is injected by usePositionNotifications (not calculate), so it
  // can ride on any result — including a dust position that otherwise hides the
  // banner. It must override the dust-hidden suppression and render as yellow.
  const maxVaultsWarning: Warning = {
    type: "max-vaults",
    title: "Maximum vaults reached",
    detail: "This position already has the maximum number of BTC Vaults (1).",
  };

  it("shows max-vaults as yellow even on a dust position", () => {
    const dustResult = calculate(makeParams([v(0.001)], { totalDebtUsd: 100 }));
    expect(hasWarning(dustResult.warnings, "dust")).toBe(true);

    const state = deriveBannerState({
      ...dustResult,
      warnings: [maxVaultsWarning, ...dustResult.warnings],
    });

    expect(state.severity).toBe("yellow");
    expect(state.primaryWarning?.type).toBe("max-vaults");
    expect(state.secondaryWarnings.some((w) => w.type === "dust")).toBe(false);
  });

  it("urgent still outranks max-vaults", () => {
    const urgentResult = calculate(makeParams([v(1.0)]));
    const state = deriveBannerState({
      ...urgentResult,
      warnings: [maxVaultsWarning, ...urgentResult.warnings],
    });
    expect(state.primaryWarning?.type).toBe("urgent");
    expect(state.severity).toBe("red");
  });
});

// Golden vectors ported from the reference calculator's scenario suite
// (tbv-liquidations, the source of truth). Defaults match the reference:
// debt 44287.72, BTC $61722.5, CF 0.75, THF 1.10, maxLB 1.05, expectedHF 0.95.
// Behavior (warning types, group structure, suggested amounts) is asserted with
// our copy strings — which intentionally differ from the reference only for the
// `urgent` titles.
describe("golden vectors (reference scenario suite)", () => {
  it("A1 — single 1.0 BTC: cliff (no backup) + urgent within 5%", () => {
    const result = calculate(makeParams([v(1.0)]));
    expect(getWarning(result.warnings, "cliff")?.title).toBe("No backup vault");
    expect(hasWarning(result.warnings, "urgent")).toBe(true);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].isFullLiquidation).toBe(true);
    // Sacrificial vault to add so the existing vault becomes protected.
    expect(result.suggestedNewVaultBtc).toBe(0.72);
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

  it("B2 — [0.80, 0.20]: over-seizure triggers a rebalance with a suggested vault", () => {
    const result = calculate(makeParams([v(0.8), v(0.2)]));
    expect(hasWarning(result.warnings, "cliff")).toBe(false);
    expect(hasWarning(result.warnings, "reorder")).toBe(false);
    expect(hasWarning(result.warnings, "rebalance")).toBe(true);
    expect(result.suggestedRebalanceVaultBtc).toBe(0.38);
  });

  it("C1 — [0.35, 0.65] wrong order: reorder notification, single group", () => {
    const result = calculate(makeParams([v(0.35), v(0.65)]));
    const reorder = getWarning(result.warnings, "reorder");
    expect(reorder?.title).toBe("Reorder vaults to lose less");
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
    expect(getWarning(result.warnings, "cliff")?.detail).toContain(
      "Neither vault",
    );
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
    const result = calculate(makeParams([v(0.1), v(0.1), v(0.35)]));
    expect(getWarning(result.warnings, "cliff")?.detail).toContain(
      "Reordering",
    );
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
      "Too many vaults",
    );
    expect(result.optimalVaultOrder).toBeNull();
  });

  it("17-vault rebalance: suggests a vault amount, no too-many-vaults at the cap", () => {
    // One large vault over-seizes; 16 tiny vaults can't combine to cover the
    // target without it. The position has 17 vaults (== MAX_DP_N), so the
    // optimizer runs an exact DP and no too-many-vaults warning fires (the
    // position is at the cap, not over it).
    const big = v(0.9);
    const smalls = Array.from({ length: 16 }, () => v(0.01));
    const result = calculate(makeParams([big, ...smalls]));

    expect(hasWarning(result.warnings, "rebalance")).toBe(true);
    expect(hasWarning(result.warnings, "too-many-vaults")).toBe(false);
    expect(result.suggestedRebalanceVaultBtc).not.toBeNull();
    // The optimal-order analysis runs an exact DP at n = 17 (the cap), which is
    // intentionally near the interactive-time budget — allow extra headroom.
  }, 20000);
});
