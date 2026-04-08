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

// Reset counter before each test
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
    // Expected: 0.75 × 0.15 / 0.3125 × 1.05/0.95 ≈ 0.3979
    expect(seizedFraction).toBeCloseTo(0.3979, 3);
  });

  it("clamps negative seized fraction to 0", () => {
    // THF < expectedHF would produce negative
    const { seizedFraction } = computeSeizedFractionDetailed(
      0.75,
      1.05,
      0.9,
      0.95,
    );
    expect(seizedFraction).toBe(0);
  });

  it("clamps seized fraction above 1 to 1", () => {
    // Extreme CF=0.95, THF=1.50 produces > 1
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
  // ── A. Single vault ──────────────────────────────────────────

  describe("single vault", () => {
    it("A1: single vault 1.0 BTC — cliff + urgent", () => {
      const result = calculate(makeParams([v(1.0)]));
      expect(hasWarning(result.warnings, "cliff")).toBe(true);
      expect(hasWarning(result.warnings, "urgent")).toBe(true);
      expect(getWarning(result.warnings, "cliff")?.title).toContain(
        "No backup vault",
      );
      expect(result.groups).toHaveLength(1);
      expect(result.groups[0].isFullLiquidation).toBe(true);
    });

    it("A2: single vault 2.0 BTC — cliff only, no urgent", () => {
      const result = calculate(makeParams([v(2.0)]));
      expect(hasWarning(result.warnings, "cliff")).toBe(true);
      expect(hasWarning(result.warnings, "urgent")).toBe(false);
    });

    it("A3: single vault 5.0 BTC — cliff, very comfortable HF", () => {
      const result = calculate(makeParams([v(5.0)]));
      expect(hasWarning(result.warnings, "cliff")).toBe(true);
      expect(result.groups).toHaveLength(1);
    });

    it("A4: single vault 0.5 BTC, debt=20000 — cliff only, no urgent", () => {
      // HF = (0.5 × 61722.5 × 0.75) / 20000 = 1.15
      const result = calculate(makeParams([v(0.5)], { totalDebtUsd: 20000 }));
      expect(hasWarning(result.warnings, "cliff")).toBe(true);
      expect(hasWarning(result.warnings, "urgent")).toBe(false);
      expect(result.groups).toHaveLength(1);
    });

    it("A5: dust — debt under $1k", () => {
      const result = calculate(makeParams([v(0.5)], { totalDebtUsd: 500 }));
      expect(hasWarning(result.warnings, "dust")).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.groups).toHaveLength(1);
      expect(result.groups[0].isFullLiquidation).toBe(true);
    });

    it("A6: dust — collateral under $1k", () => {
      const result = calculate(makeParams([v(0.00001)]));
      expect(hasWarning(result.warnings, "dust")).toBe(true);
      expect(result.warnings).toHaveLength(1);
    });

    it("A7: single vault, HF < 1 — already liquidatable", () => {
      const result = calculate(makeParams([v(1.0)], { totalDebtUsd: 50000 }));
      expect(hasWarning(result.warnings, "cliff")).toBe(true);
      expect(hasWarning(result.warnings, "urgent")).toBe(true);
      expect(getWarning(result.warnings, "urgent")?.title).toContain(
        "already liquidatable",
      );
    });

    it("suggests sacrificial vault size for single vault", () => {
      const result = calculate(makeParams([v(1.0)]));
      expect(result.suggestedNewVaultBtc).not.toBeNull();
      expect(result.suggestedNewVaultBtc!).toBeGreaterThan(0);
    });
  });

  // ── B. Two vaults — correct order ──────────────────────────────

  describe("two vaults correct order", () => {
    it("B1: [0.65, 0.35] — 2 groups, no cliff/reorder", () => {
      const result = calculate(makeParams([v(0.65), v(0.35)]));
      expect(hasWarning(result.warnings, "cliff")).toBe(false);
      expect(hasWarning(result.warnings, "reorder")).toBe(false);
      expect(result.groups).toHaveLength(2);
      expect(result.groups[0].vaults).toHaveLength(1);
      expect(result.groups[0].combinedBtc).toBeCloseTo(0.65, 2);
    });

    it("B2: [0.80, 0.20] — correct order, large over-seizure", () => {
      const result = calculate(makeParams([v(0.8), v(0.2)]));
      expect(hasWarning(result.warnings, "cliff")).toBe(false);
      expect(hasWarning(result.warnings, "reorder")).toBe(false);
      expect(result.groups).toHaveLength(2);
      expect(result.groups[0].vaults).toHaveLength(1);
      expect(result.groups[0].combinedBtc).toBeCloseTo(0.8, 2);
    });

    it("B3: [0.50, 0.50] — both cover target, 2 groups", () => {
      const result = calculate(makeParams([v(0.5), v(0.5)]));
      expect(hasWarning(result.warnings, "cliff")).toBe(false);
      expect(hasWarning(result.warnings, "reorder")).toBe(false);
      expect(result.groups).toHaveLength(2);
    });

    it("B4: [0.42, 0.58] — first barely covers target", () => {
      // target=0.3979, 0.42 > 0.3979 → covers alone
      const result = calculate(makeParams([v(0.42), v(0.58)]));
      expect(hasWarning(result.warnings, "cliff")).toBe(false);
      expect(hasWarning(result.warnings, "reorder")).toBe(false);
      expect(result.groups).toHaveLength(2);
    });

    it("B5: [2.0, 1.0] — comfortable HF, no urgent", () => {
      const result = calculate(makeParams([v(2.0), v(1.0)]));
      expect(hasWarning(result.warnings, "cliff")).toBe(false);
      expect(hasWarning(result.warnings, "reorder")).toBe(false);
      expect(hasWarning(result.warnings, "urgent")).toBe(false);
      expect(result.groups).toHaveLength(2);
    });
  });

  // ── C. Two vaults — wrong order ────────────────────────────────

  describe("two vaults wrong order", () => {
    it("C1: [0.35, 0.65] — cliff fixable by reorder (swap)", () => {
      const result = calculate(makeParams([v(0.35), v(0.65)]));
      expect(hasWarning(result.warnings, "cliff")).toBe(true);
      expect(getWarning(result.warnings, "cliff")?.title).toContain("Swap");
    });

    it("C2: [0.20, 0.80] — cliff fixable by reorder", () => {
      const result = calculate(makeParams([v(0.2), v(0.8)]));
      expect(hasWarning(result.warnings, "cliff")).toBe(true);
      expect(getWarning(result.warnings, "cliff")?.title).toContain("Swap");
    });

    it("C3: [0.39, 0.61] — just below target boundary, cliff fixable by reorder", () => {
      // target=0.3979, threshold=0.3939. 0.39 < 0.3939 → cliff; 0.61 covers → reorder
      const result = calculate(makeParams([v(0.39), v(0.61)]));
      expect(hasWarning(result.warnings, "cliff")).toBe(true);
    });

    it("C4: [0.10, 0.90] — cliff fixable by reorder", () => {
      const result = calculate(makeParams([v(0.1), v(0.9)]));
      expect(hasWarning(result.warnings, "cliff")).toBe(true);
      expect(getWarning(result.warnings, "cliff")?.title).toContain("Swap");
    });

    it("C5: [0.30, 0.30] total=0.60 — each covers, no cliff", () => {
      const result = calculate(makeParams([v(0.3), v(0.3)]));
      expect(hasWarning(result.warnings, "cliff")).toBe(false);
      expect(result.groups).toHaveLength(2);
    });
  });

  // ── D. Two vaults — cliff with high THF ────────────────────────

  describe("two vaults cliff with high THF", () => {
    it("D1: THF=1.30, [0.50, 0.50] — neither covers", () => {
      const result = calculate(makeParams([v(0.5), v(0.5)], { THF: 1.3 }));
      expect(hasWarning(result.warnings, "cliff")).toBe(true);
      expect(getWarning(result.warnings, "cliff")?.title).toContain(
        "Both vaults seized together",
      );
    });

    it("D2: THF=1.30, [0.48, 0.52] — neither covers", () => {
      // seized_frac=0.566, both 0.48 and 0.52 < 0.566
      const result = calculate(makeParams([v(0.48), v(0.52)], { THF: 1.3 }));
      expect(hasWarning(result.warnings, "cliff")).toBe(true);
    });

    it("D3: THF=1.30, [0.40, 0.60] — 0.60 covers, cliff fixable by reorder", () => {
      const result = calculate(makeParams([v(0.4), v(0.6)], { THF: 1.3 }));
      expect(hasWarning(result.warnings, "cliff")).toBe(true);
    });

    it("D4: THF=1.40, [0.50, 0.50] — extreme THF, cliff", () => {
      const result = calculate(makeParams([v(0.5), v(0.5)], { THF: 1.4 }));
      expect(hasWarning(result.warnings, "cliff")).toBe(true);
    });
  });

  // ── E. Three vaults — good config ──────────────────────────────

  describe("three vaults good config", () => {
    it("E1: [0.42, 0.29, 0.29] — optimal, 3 events", () => {
      const result = calculate(makeParams([v(0.42), v(0.29), v(0.29)]));
      expect(hasWarning(result.warnings, "cliff")).toBe(false);
      expect(hasWarning(result.warnings, "reorder")).toBe(false);
      expect(result.groups).toHaveLength(3);
    });

    it("E2: [0.50, 0.30, 0.20] — optimizer finds better order, reorder", () => {
      const result = calculate(makeParams([v(0.5), v(0.3), v(0.2)]));
      expect(hasWarning(result.warnings, "cliff")).toBe(false);
      expect(hasWarning(result.warnings, "reorder")).toBe(true);
      expect(result.groups).toHaveLength(3);
    });

    it("E3: [2.0, 1.5, 1.0] — comfortable HF, no urgent", () => {
      // HF = (4.5 × 61722.5 × 0.75) / 44287.72 = 4.70
      const result = calculate(makeParams([v(2.0), v(1.5), v(1.0)]));
      expect(hasWarning(result.warnings, "urgent")).toBe(false);
      expect(result.groups).toHaveLength(3);
    });
  });

  // ── F. Three vaults — reorder needed ───────────────────────────

  describe("three vaults reorder needed", () => {
    it("F1: [0.29, 0.42, 0.29] — put 0.42 first", () => {
      const result = calculate(makeParams([v(0.29), v(0.42), v(0.29)]));
      expect(hasWarning(result.warnings, "reorder")).toBe(true);
      expect(hasWarning(result.warnings, "cliff")).toBe(false);
    });

    it("F2: [0.29, 0.29, 0.42] — put 0.42 first", () => {
      const result = calculate(makeParams([v(0.29), v(0.29), v(0.42)]));
      expect(hasWarning(result.warnings, "reorder")).toBe(true);
    });

    it("F3: [0.10, 0.50, 0.40] — optimal is 0.40 first", () => {
      const result = calculate(makeParams([v(0.1), v(0.5), v(0.4)]));
      expect(hasWarning(result.warnings, "reorder")).toBe(true);
    });

    it("F4: [0.60, 0.10, 0.10] — already optimal, no reorder", () => {
      const result = calculate(makeParams([v(0.6), v(0.1), v(0.1)]));
      expect(hasWarning(result.warnings, "reorder")).toBe(false);
    });

    it("F5: [0.60, 0.10, 0.10, 0.10, 0.10] — reorder suppressed by anti-loop", () => {
      const result = calculate(
        makeParams([v(0.6), v(0.1), v(0.1), v(0.1), v(0.1)]),
      );
      expect(hasWarning(result.warnings, "reorder")).toBe(false);
    });
  });

  // ── G. Three+ vaults — cliff ──────────────────────────────────

  describe("three+ vaults cliff", () => {
    it("G1: [0.10, 0.10, 0.80] — cliff, reorder suppressed", () => {
      const result = calculate(makeParams([v(0.1), v(0.1), v(0.8)]));
      expect(hasWarning(result.warnings, "cliff")).toBe(true);
      expect(hasWarning(result.warnings, "reorder")).toBe(false);
      expect(result.groups).toHaveLength(1);
    });

    it("G2: [0.10, 0.10, 0.35] — cliff, reorder fixes it", () => {
      const result = calculate(makeParams([v(0.1), v(0.1), v(0.35)]));
      expect(hasWarning(result.warnings, "cliff")).toBe(true);
      expect(getWarning(result.warnings, "cliff")?.detail).toContain(
        "Reordering",
      );
    });

    it("G3: [0.05, 0.05, 0.05, 0.85] — 4-vault cliff, reorder suppressed", () => {
      const result = calculate(
        makeParams([v(0.05), v(0.05), v(0.05), v(0.85)]),
      );
      expect(hasWarning(result.warnings, "cliff")).toBe(true);
      expect(hasWarning(result.warnings, "reorder")).toBe(false);
      expect(result.groups).toHaveLength(1);
    });
  });

  // ── H. Many vaults ─────────────────────────────────────────────

  describe("many vaults", () => {
    it("H1: [0.42, 0.15, 0.15, 0.15, 0.13] — good split, no cliff", () => {
      const result = calculate(
        makeParams([v(0.42), v(0.15), v(0.15), v(0.15), v(0.13)]),
      );
      expect(hasWarning(result.warnings, "cliff")).toBe(false);
      expect(result.groups.length).toBeGreaterThanOrEqual(3);
    });

    it("H2: 10 × 0.10 BTC — cascading events, no cliff", () => {
      const vaults = Array.from({ length: 10 }, () => v(0.1));
      const result = calculate(makeParams(vaults));
      expect(hasWarning(result.warnings, "cliff")).toBe(false);
    });

    it("H3: [0.05, 0.05, 0.05, 0.05, 0.80] — 5-vault cliff, reorder suppressed", () => {
      const result = calculate(
        makeParams([v(0.05), v(0.05), v(0.05), v(0.05), v(0.8)]),
      );
      expect(hasWarning(result.warnings, "cliff")).toBe(true);
      expect(hasWarning(result.warnings, "reorder")).toBe(false);
      expect(result.groups).toHaveLength(1);
    });

    it("H4: 8 vaults mixed — reorder detects smaller optimal G1", () => {
      const result = calculate(
        makeParams([
          v(0.5),
          v(0.1),
          v(0.08),
          v(0.08),
          v(0.08),
          v(0.06),
          v(0.05),
          v(0.05),
        ]),
      );
      expect(hasWarning(result.warnings, "reorder")).toBe(true);
    });

    it("H5: geometric [1.0, 0.5, 0.25, ...] — anti-loop suppression", () => {
      const result = calculate(
        makeParams([
          v(1.0),
          v(0.5),
          v(0.25),
          v(0.12),
          v(0.06),
          v(0.03),
          v(0.02),
          v(0.01),
          v(0.005),
          v(0.005),
        ]),
      );
      expect(hasWarning(result.warnings, "cliff")).toBe(false);
      expect(hasWarning(result.warnings, "reorder")).toBe(false);
    });
  });

  // ── I. Vault removal scenarios ──────────────────────────────────

  describe("vault removal scenarios", () => {
    it("I1: [0.65] remains after removing 0.35 — cliff", () => {
      const result = calculate(makeParams([v(0.65)]));
      expect(hasWarning(result.warnings, "cliff")).toBe(true);
      expect(result.groups).toHaveLength(1);
    });

    it("I2: [0.35] remains after removing 0.65 — cliff + urgent", () => {
      const result = calculate(makeParams([v(0.35)]));
      expect(hasWarning(result.warnings, "cliff")).toBe(true);
      expect(hasWarning(result.warnings, "urgent")).toBe(true);
    });

    it("I3: [0.29, 0.29] after removing 0.42 — each covers, no cliff", () => {
      // total=0.58, target=0.231; 0.29 >= 0.231 → each covers
      const result = calculate(makeParams([v(0.29), v(0.29)]));
      expect(hasWarning(result.warnings, "cliff")).toBe(false);
      expect(result.groups).toHaveLength(2);
    });

    it("I4: [0.42, 0.29] after removing middle vault — no cliff", () => {
      // target=0.71*0.3979=0.283; 0.42 >= 0.283
      const result = calculate(makeParams([v(0.42), v(0.29)]));
      expect(hasWarning(result.warnings, "cliff")).toBe(false);
      expect(result.groups).toHaveLength(2);
    });

    it("I6: [0.15, 0.15, 0.15, 0.15] — 3 groups after removing sacrificial", () => {
      // target=0.60*0.3979=0.239; each 0.15 < 0.239; 2 seized per event
      const result = calculate(
        makeParams([v(0.15), v(0.15), v(0.15), v(0.15)]),
      );
      expect(result.groups.length).toBeGreaterThanOrEqual(2);
    });

    it("I7: [1.0] — single vault after removing 9, cliff", () => {
      const result = calculate(makeParams([v(1.0)]));
      expect(hasWarning(result.warnings, "cliff")).toBe(true);
      expect(result.groups).toHaveLength(1);
    });
  });

  // ── J. Vault addition scenarios ──────────────────────────────────

  describe("vault addition scenarios", () => {
    it("J1: [1.0, 0.01] — cliff resolved, over-seizure pays all debt", () => {
      const result = calculate(makeParams([v(1.0), v(0.01)]));
      expect(hasWarning(result.warnings, "cliff")).toBe(false);
    });

    it("J2: [1.0, 0.50] — no cliff, 2 groups", () => {
      const result = calculate(makeParams([v(1.0), v(0.5)]));
      expect(hasWarning(result.warnings, "cliff")).toBe(false);
      expect(result.groups).toHaveLength(2);
    });

    it("J3: [0.35, 0.65, 1.0] — optimizer finds better order", () => {
      const result = calculate(makeParams([v(0.35), v(0.65), v(1.0)]));
      expect(hasWarning(result.warnings, "reorder")).toBe(true);
    });

    it("J4: [0.42, 0.29, 0.29, 0.10] — cascade produces 3 events", () => {
      const result = calculate(makeParams([v(0.42), v(0.29), v(0.29), v(0.1)]));
      expect(hasWarning(result.warnings, "cliff")).toBe(false);
      expect(result.groups.length).toBeGreaterThanOrEqual(2);
    });

    it("J5: [1.0, 0.05×5] — no cliff after adding tiny vaults", () => {
      const result = calculate(
        makeParams([v(1.0), v(0.05), v(0.05), v(0.05), v(0.05), v(0.05)]),
      );
      expect(hasWarning(result.warnings, "cliff")).toBe(false);
    });
  });

  // ── K. CF variations ──────────────────────────────────────────

  describe("CF variations", () => {
    it("K1: CF=0.50, [0.65, 0.35] — small seized_fraction, no cliff", () => {
      // seized_frac=0.145; 0.65 >> 0.145
      const result = calculate(makeParams([v(0.65), v(0.35)], { CF: 0.5 }));
      expect(hasWarning(result.warnings, "cliff")).toBe(false);
    });

    it("K2: CF=0.60, [0.65, 0.35] — medium CF, no cliff", () => {
      const result = calculate(makeParams([v(0.65), v(0.35)], { CF: 0.6 }));
      expect(hasWarning(result.warnings, "cliff")).toBe(false);
    });

    it("K3: CF=0.80, [0.65, 0.35] — 0.65 covers", () => {
      const result = calculate(makeParams([v(0.65), v(0.35)], { CF: 0.8 }));
      expect(hasWarning(result.warnings, "cliff")).toBe(false);
    });

    it("K4: CF=0.80, [0.50, 0.50] — seized_frac=0.510, cliff", () => {
      const result = calculate(makeParams([v(0.5), v(0.5)], { CF: 0.8 }));
      expect(hasWarning(result.warnings, "cliff")).toBe(true);
    });

    it("K5: CF=0.90, [0.65, 0.35] — extreme CF, seized_frac=0.963, cliff", () => {
      const result = calculate(makeParams([v(0.65), v(0.35)], { CF: 0.9 }));
      expect(hasWarning(result.warnings, "cliff")).toBe(true);
    });

    it("K6: CF=0.90, THF=1.40, [1.0, 0.5] — extreme params", () => {
      const result = calculate(
        makeParams([v(1.0), v(0.5)], { CF: 0.9, THF: 1.4 }),
      );
      // seized_frac < 1, valid params
      expect(hasWarning(result.warnings, "weird-params")).toBe(false);
    });
  });

  // ── L. THF variations ──────────────────────────────────────────

  describe("THF variations", () => {
    it("L1: THF=1.05, [0.65, 0.35] — small seized_fraction, no cliff", () => {
      // seized_frac=0.316; 0.65 >> 0.316
      const result = calculate(makeParams([v(0.65), v(0.35)], { THF: 1.05 }));
      expect(hasWarning(result.warnings, "cliff")).toBe(false);
    });

    it("L2: THF=1.07, [0.35, 0.65] — 0.35 covers within 1% tol, no cliff/reorder", () => {
      // seized_frac≈0.352; threshold=0.3485; 0.35 > 0.3485
      const result = calculate(makeParams([v(0.35), v(0.65)], { THF: 1.07 }));
      expect(hasWarning(result.warnings, "reorder")).toBe(false);
      expect(hasWarning(result.warnings, "cliff")).toBe(false);
      expect(result.groups).toHaveLength(2);
    });

    it("L3: THF=1.14, [0.42, 0.58] — cliff fixable by reorder", () => {
      // seized_frac≈0.447; 0.42 < 0.447 → cliff; 0.58 >= 0.447 → reorder
      const result = calculate(makeParams([v(0.42), v(0.58)], { THF: 1.14 }));
      expect(hasWarning(result.warnings, "cliff")).toBe(true);
    });

    it("L4: THF=1.20, [0.50, 0.50] — within tolerance, no cliff", () => {
      // seized_frac=0.5024; threshold=0.4974; 0.50 > 0.4974
      const result = calculate(makeParams([v(0.5), v(0.5)], { THF: 1.2 }));
      expect(hasWarning(result.warnings, "cliff")).toBe(false);
    });

    it("L5: THF=1.25, [0.60, 0.40] — no cliff", () => {
      // seized_frac=0.585; 0.60 >= 0.585
      const result = calculate(makeParams([v(0.6), v(0.4)], { THF: 1.25 }));
      expect(hasWarning(result.warnings, "cliff")).toBe(false);
    });

    it("L6: THF=1.40, [0.65, 0.35] — covers within tolerance, no cliff", () => {
      // seized_frac=0.6090; threshold=0.6029; 0.65 > 0.6029
      const result = calculate(makeParams([v(0.65), v(0.35)], { THF: 1.4 }));
      expect(hasWarning(result.warnings, "cliff")).toBe(false);
    });
  });

  // ── M. Boundary cases ─────────────────────────────────────────

  describe("boundary cases", () => {
    it("M1: vault exactly = target (within 1% tol) — no cliff", () => {
      const result = calculate(makeParams([v(0.3979), v(0.6021)]));
      expect(hasWarning(result.warnings, "cliff")).toBe(false);
    });

    it("M2: [0.394, 0.606] — within 1% tolerance, no cliff/reorder", () => {
      // target=0.3979; threshold=0.3939. 0.394 > 0.3939
      const result = calculate(makeParams([v(0.394), v(0.606)]));
      expect(hasWarning(result.warnings, "cliff")).toBe(false);
      expect(hasWarning(result.warnings, "reorder")).toBe(false);
    });

    it("M3: [0.393, 0.607] — just below 1% tolerance, cliff fixable by reorder", () => {
      // 0.393 < 0.3939 → outside tol; 0.607 > 0.3939 → cliff fixable by reorder
      const result = calculate(makeParams([v(0.393), v(0.607)]));
      expect(hasWarning(result.warnings, "cliff")).toBe(true);
    });

    it("M5: zero debt — no risk, no groups", () => {
      const result = calculate(makeParams([v(1.0)], { totalDebtUsd: 0 }));
      expect(result.warnings).toHaveLength(0);
      expect(result.groups).toHaveLength(0);
      expect(result.currentHF).toBe(Infinity);
    });

    it("M4: HF exactly at liquidation threshold", () => {
      const result = calculate(
        makeParams([v(1.0)], { totalDebtUsd: 46291.875 }),
      );
      expect(hasWarning(result.warnings, "urgent")).toBe(true);
      expect(getWarning(result.warnings, "urgent")?.title).toContain(
        "already liquidatable",
      );
    });
  });

  // ── N. CF + THF matrix ───────────────────────────────────────────

  describe("CF+THF matrix", () => {
    it("N1: CF=0.50, THF=1.05, [0.50, 0.50] — no cliff", () => {
      // seized_frac=0.105; both 0.50 >> 0.105
      const result = calculate(
        makeParams([v(0.5), v(0.5)], { CF: 0.5, THF: 1.05 }),
      );
      expect(hasWarning(result.warnings, "cliff")).toBe(false);
    });

    it("N2: CF=0.50, THF=1.10, [0.50, 0.50] — no cliff", () => {
      // seized_frac=0.145; both 0.50 >> 0.145
      const result = calculate(
        makeParams([v(0.5), v(0.5)], { CF: 0.5, THF: 1.1 }),
      );
      expect(hasWarning(result.warnings, "cliff")).toBe(false);
    });

    it("N3: CF=0.70, THF=1.14, [0.42, 0.58] — no cliff", () => {
      // seized_frac=0.370; 0.42 > 0.370
      const result = calculate(
        makeParams([v(0.42), v(0.58)], { CF: 0.7, THF: 1.14 }),
      );
      expect(hasWarning(result.warnings, "cliff")).toBe(false);
    });

    it("N4: CF=0.75, THF=1.07, [0.35, 0.65] — within tolerance, no cliff", () => {
      // seized_frac≈0.351; threshold=0.347; 0.35 > 0.347
      const result = calculate(
        makeParams([v(0.35), v(0.65)], { CF: 0.75, THF: 1.07 }),
      );
      expect(hasWarning(result.warnings, "cliff")).toBe(false);
    });

    it("N5: CF=0.80, THF=1.10, [0.55, 0.45] — no cliff", () => {
      // seized_frac=0.510; 0.55 > 0.510
      const result = calculate(
        makeParams([v(0.55), v(0.45)], { CF: 0.8, THF: 1.1 }),
      );
      expect(hasWarning(result.warnings, "cliff")).toBe(false);
    });

    it("N6: CF=0.80, THF=1.10, [0.50, 0.50] — cliff", () => {
      // 0.50 < target=0.510
      const result = calculate(
        makeParams([v(0.5), v(0.5)], { CF: 0.8, THF: 1.1 }),
      );
      expect(hasWarning(result.warnings, "cliff")).toBe(true);
    });
  });

  // ── Warning priority rules ─────────────────────────────────────

  describe("warning priority rules", () => {
    it("dust blocks all other warnings", () => {
      const result = calculate(makeParams([v(0.5)], { totalDebtUsd: 500 }));
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].type).toBe("dust");
    });

    it("urgent coexists with cliff", () => {
      const result = calculate(makeParams([v(1.0)], { totalDebtUsd: 50000 }));
      expect(hasWarning(result.warnings, "cliff")).toBe(true);
      expect(hasWarning(result.warnings, "urgent")).toBe(true);
    });

    it("cliff and rebalance never appear together", () => {
      const result = calculate(makeParams([v(0.2), v(0.8)]));
      const hasCliff = hasWarning(result.warnings, "cliff");
      const hasRebalance = hasWarning(result.warnings, "rebalance");
      expect(hasCliff && hasRebalance).toBe(false);
    });

    it("reorder and rebalance never appear together", () => {
      const result = calculate(makeParams([v(0.35), v(0.65)]));
      const hasReorder = hasWarning(result.warnings, "reorder");
      const hasRebalance = hasWarning(result.warnings, "rebalance");
      expect(hasReorder && hasRebalance).toBe(false);
    });
  });

  // ── Rebalance ──────────────────────────────────────────────────

  describe("rebalance", () => {
    it("triggers when over-seizure > protected BTC", () => {
      // [0.60, 0.10] — over-seizure = 0.60 - target ≈ 0.32 > protected 0.10
      const result = calculate(makeParams([v(0.6), v(0.1)]));
      expect(hasWarning(result.warnings, "rebalance")).toBe(true);
      expect(result.suggestedRebalanceVaultBtc).not.toBeNull();
    });

    it("does not trigger when protected > over-seizure", () => {
      // [0.50, 0.50] — over-seizure ≈ 0.10, protected 0.50
      const result = calculate(makeParams([v(0.5), v(0.5)]));
      expect(hasWarning(result.warnings, "rebalance")).toBe(false);
    });
  });

  // ── Weird params ───────────────────────────────────────────────

  describe("weird params", () => {
    it("emits weird-params when seized fraction raw < 0", () => {
      const result = calculate(makeParams([v(1.0)], { THF: 0.9 }));
      expect(hasWarning(result.warnings, "weird-params")).toBe(true);
    });
  });
});

describe("bannerSeverity", () => {
  it("returns green when no warnings", () => {
    // Use large vaults (3 BTC total) to ensure comfortable HF — no urgent
    const result = calculate(makeParams([v(2.0), v(1.0)]));
    const state = deriveBannerState(result);
    expect(state.severity).toBe("green");
  });

  it("returns red for urgent warning", () => {
    const result = calculate(makeParams([v(1.0)], { totalDebtUsd: 50000 }));
    const state = deriveBannerState(result);
    expect(state.severity).toBe("red");
    expect(state.primaryWarning?.type).toBe("urgent");
  });

  it("returns red for cliff warning", () => {
    const result = calculate(makeParams([v(1.0)]));
    const state = deriveBannerState(result);
    expect(state.severity).toBe("red");
  });

  it("returns hidden for dust", () => {
    const result = calculate(makeParams([v(0.5)], { totalDebtUsd: 500 }));
    const state = deriveBannerState(result);
    expect(state.severity).toBe("hidden");
    expect(state.primaryWarning?.type).toBe("dust");
    expect(state.secondaryWarnings).toHaveLength(0);
  });

  it("returns red for cliff fixable by reorder", () => {
    // [1.0, 2.0] wrong order — cliff fixable by reorder emits type "cliff" → red
    const result = calculate(makeParams([v(1.0), v(2.0)]));
    const state = deriveBannerState(result);
    expect(state.severity).toBe("red");
  });

  it("returns yellow for rebalance", () => {
    // Use large vaults to avoid urgent, but imbalanced sizes
    const result = calculate(makeParams([v(3.0), v(0.5)]));
    const state = deriveBannerState(result);
    expect(state.severity).toBe("yellow");
  });

  it("returns hidden when no groups (zero debt)", () => {
    const result = calculate(makeParams([v(1.0)], { totalDebtUsd: 0 }));
    const state = deriveBannerState(result);
    expect(state.severity).toBe("hidden");
  });
});
