/**
 * Tests for vault split calculation utilities
 */

import { describe, expect, it } from "vitest";

import {
  checkRebalanceNeeded,
  computeMinDepositForSplit,
  computeOptimalSplit,
  computeSeizedFraction,
  computeSeizedFractionDetailed,
} from "../vaultSplit.js";

// Mock parameter values (contracts not deployed yet)
const DEFAULT_PARAMS = {
  CF: 0.75,
  LB: 1.05,
  THF: 1.1,
  expectedHF: 0.95,
  safetyMargin: 1.05,
};

describe("vaultSplit", () => {
  describe("computeSeizedFraction", () => {
    it("should compute seized fraction for default parameters", () => {
      const { CF, LB, THF, expectedHF } = DEFAULT_PARAMS;
      const fraction = computeSeizedFraction(CF, LB, THF, expectedHF);

      // liq_penalty = 1.05 * 0.75 = 0.7875
      // seized_fraction = 0.75 * (1.10 - 0.95) / (1.10 - 0.7875) * 1.05 / 0.95
      //                 = 0.75 * 0.15 / 0.3125 * 1.105263...
      //                 ≈ 0.398
      expect(fraction).toBeCloseTo(0.398, 2);
    });

    it("should return 1 when THF <= liq_penalty (full liquidation inevitable)", () => {
      // liq_penalty = 1.5 * 0.75 = 1.125, THF = 1.10 < 1.125
      const fraction = computeSeizedFraction(0.75, 1.5, 1.1, 0.95);
      expect(fraction).toBe(1);
    });

    it("should return 1 when THF equals liq_penalty", () => {
      // liq_penalty = LB * CF. Set LB = THF / CF = 1.10 / 0.75 ≈ 1.4667
      const LB = 1.1 / 0.75;
      const fraction = computeSeizedFraction(0.75, LB, 1.1, 0.95);
      expect(fraction).toBe(1);
    });

    it("should return 1 when expectedHF is 0 (fully underwater)", () => {
      const fraction = computeSeizedFraction(0.75, 1.05, 1.1, 0);
      expect(fraction).toBe(1);
    });

    it("should return 1 when expectedHF is negative", () => {
      const fraction = computeSeizedFraction(0.75, 1.05, 1.1, -0.5);
      expect(fraction).toBe(1);
    });

    it("should clamp to 0 when expectedHF >= THF", () => {
      // When expectedHF >= THF, (THF - expectedHF) <= 0, so fraction <= 0
      const fraction = computeSeizedFraction(0.75, 1.05, 1.1, 1.2);
      expect(fraction).toBe(0);
    });

    it("should clamp to 0 when expectedHF equals THF", () => {
      const fraction = computeSeizedFraction(0.75, 1.05, 1.1, 1.1);
      expect(fraction).toBe(0);
    });

    it("should return raw and clamped values from computeSeizedFractionDetailed", () => {
      const { CF, LB, THF, expectedHF } = DEFAULT_PARAMS;
      const result = computeSeizedFractionDetailed(CF, LB, THF, expectedHF);
      expect(result.seizedFraction).toBeCloseTo(0.398, 2);
      expect(result.seizedFractionRaw).toBeCloseTo(0.398, 2);
    });

    it("should expose raw value outside [0,1] for unusual params", () => {
      // expectedHF > THF → negative raw value
      const result = computeSeizedFractionDetailed(0.75, 1.05, 1.1, 1.2);
      expect(result.seizedFractionRaw).toBeLessThan(0);
      expect(result.seizedFraction).toBe(0);
    });

    it("should return Infinity raw when expectedHF <= 0", () => {
      const result = computeSeizedFractionDetailed(0.75, 1.05, 1.1, 0);
      expect(result.seizedFractionRaw).toBe(Infinity);
      expect(result.seizedFraction).toBe(1);
    });

    it("should stay in [0, 1] for a range of valid parameters", () => {
      const cfValues = [0.5, 0.6, 0.7, 0.75, 0.8, 0.9];
      const lbValues = [1.02, 1.05, 1.08, 1.1];
      const thfValues = [1.05, 1.1, 1.15, 1.2];

      for (const CF of cfValues) {
        for (const LB of lbValues) {
          for (const THF of thfValues) {
            const fraction = computeSeizedFraction(CF, LB, THF, 0.95);
            expect(fraction).toBeGreaterThanOrEqual(0);
            expect(fraction).toBeLessThanOrEqual(1);
          }
        }
      }
    });
  });

  describe("computeOptimalSplit", () => {
    it("should compute correct split for 10 BTC worked example", () => {
      const result = computeOptimalSplit({
        totalBtc: 1_000_000_000n, // 10 BTC
        ...DEFAULT_PARAMS,
      });

      // seized_fraction ≈ 0.398
      expect(result.seizedFraction).toBeCloseTo(0.398, 2);

      // sacrificial ≈ 10 * 0.398 * 1.05 ≈ 4.18 BTC = 418_000_000 sats (approx)
      expect(Number(result.sacrificialVault)).toBeCloseTo(418_000_000, -6);

      // protected ≈ 5.82 BTC
      expect(Number(result.protectedVault)).toBeCloseTo(582_000_000, -6);

      // Vaults must sum to total
      expect(result.sacrificialVault + result.protectedVault).toBe(
        1_000_000_000n,
      );

      // Target seizure (before safety margin) ≈ 3.98 BTC
      expect(Number(result.targetSeizureBtc)).toBeCloseTo(398_000_000, -6);
    });

    it("should return zero vaults for zero amount", () => {
      const result = computeOptimalSplit({
        totalBtc: 0n,
        ...DEFAULT_PARAMS,
      });

      expect(result.sacrificialVault).toBe(0n);
      expect(result.protectedVault).toBe(0n);
      expect(result.seizedFraction).toBe(0);
      expect(result.targetSeizureBtc).toBe(0n);
    });

    it("should return zero vaults for negative amount", () => {
      const result = computeOptimalSplit({
        totalBtc: -100n,
        ...DEFAULT_PARAMS,
      });

      expect(result.sacrificialVault).toBe(0n);
      expect(result.protectedVault).toBe(0n);
    });

    it("should cap sacrificial at totalBtc when full liquidation", () => {
      // THF <= liq_penalty → seized_fraction = 1
      const result = computeOptimalSplit({
        totalBtc: 500_000_000n,
        CF: 0.75,
        LB: 1.5,
        THF: 1.1,
        expectedHF: 0.95,
        safetyMargin: 1.05,
      });

      // seized_fraction = 1, sacrificial = total * 1 * 1.05 = capped at total
      expect(result.sacrificialVault).toBe(500_000_000n);
      expect(result.protectedVault).toBe(0n);
      expect(result.seizedFraction).toBe(1);
    });

    it("should return single vault when expectedHF >= THF", () => {
      const result = computeOptimalSplit({
        totalBtc: 1_000_000_000n,
        CF: 0.75,
        LB: 1.05,
        THF: 1.1,
        expectedHF: 1.2,
        safetyMargin: 1.05,
      });

      // seized_fraction = 0, no split needed
      expect(result.sacrificialVault).toBe(0n);
      expect(result.protectedVault).toBe(1_000_000_000n);
      expect(result.seizedFraction).toBe(0);
    });

    it("should always have sacrificial + protected = totalBtc", () => {
      const amounts = [
        100_000n,
        1_000_000n,
        50_000_000n,
        1_000_000_000n,
        2_100_000_000_000_000n,
      ];

      for (const totalBtc of amounts) {
        const result = computeOptimalSplit({
          totalBtc,
          ...DEFAULT_PARAMS,
        });
        expect(result.sacrificialVault + result.protectedVault).toBe(totalBtc);
      }
    });

    it("should throw RangeError when totalBtc exceeds Number.MAX_SAFE_INTEGER", () => {
      expect(() =>
        computeOptimalSplit({
          totalBtc: BigInt(Number.MAX_SAFE_INTEGER) + 1n,
          ...DEFAULT_PARAMS,
        }),
      ).toThrow(RangeError);
    });

    it("should handle small amounts above dust threshold correctly", () => {
      const result = computeOptimalSplit({
        totalBtc: 100_000n, // 100k sats — well above dust
        ...DEFAULT_PARAMS,
      });

      expect(result.sacrificialVault + result.protectedVault).toBe(100_000n);
      expect(result.sacrificialVault).toBeGreaterThan(0n);
    });

    it("should return zeroed vaults when sacrificial amount is below HTLC dust threshold", () => {
      // totalBtc = 100 sats → sacrificial ≈ 42 sats, protected ≈ 58 sats
      // Both are well below the 2000 sat HTLC dust threshold
      const result = computeOptimalSplit({
        totalBtc: 100n,
        ...DEFAULT_PARAMS,
      });

      expect(result.sacrificialVault).toBe(0n);
      expect(result.protectedVault).toBe(0n);
      expect(result.targetSeizureBtc).toBe(0n);
    });

    it("should return zeroed vaults when protected amount is below HTLC dust threshold", () => {
      // seizedFraction ≈ 0.8605, share ≈ 0.9035
      // totalBtc = 19739 → sacrificial ≈ 17835, protected ≈ 1904 (below 2000)
      const result = computeOptimalSplit({
        totalBtc: 19_739n,
        CF: 0.75,
        LB: 1.05,
        THF: 1.1,
        expectedHF: 0.82,
        safetyMargin: 1.05,
      });

      expect(result.sacrificialVault).toBe(0n);
      expect(result.protectedVault).toBe(0n);
      expect(result.targetSeizureBtc).toBe(0n);
    });
  });

  describe("computeMinDepositForSplit", () => {
    it("should compute minimum deposit so both vaults >= minPegin", () => {
      const seizedFraction = computeSeizedFraction(
        DEFAULT_PARAMS.CF,
        DEFAULT_PARAMS.LB,
        DEFAULT_PARAMS.THF,
        DEFAULT_PARAMS.expectedHF,
      );

      const minDeposit = computeMinDepositForSplit({
        minPegin: 50_000n,
        seizedFraction,
        safetyMargin: DEFAULT_PARAMS.safetyMargin,
      });

      // Verify: at minDeposit, both vaults should be >= minPegin
      const split = computeOptimalSplit({
        totalBtc: minDeposit,
        ...DEFAULT_PARAMS,
      });

      expect(split.sacrificialVault).toBeGreaterThanOrEqual(50_000n);
      expect(split.protectedVault).toBeGreaterThanOrEqual(50_000n);
    });

    it("should return deposit where just below produces a vault < minPegin", () => {
      const seizedFraction = computeSeizedFraction(
        DEFAULT_PARAMS.CF,
        DEFAULT_PARAMS.LB,
        DEFAULT_PARAMS.THF,
        DEFAULT_PARAMS.expectedHF,
      );

      const minDeposit = computeMinDepositForSplit({
        minPegin: 50_000n,
        seizedFraction,
        safetyMargin: DEFAULT_PARAMS.safetyMargin,
      });

      // Significantly below should produce at least one vault < minPegin
      if (minDeposit > 100n) {
        const split = computeOptimalSplit({
          totalBtc: minDeposit - 100n,
          ...DEFAULT_PARAMS,
        });
        const smallerVault =
          split.sacrificialVault < split.protectedVault
            ? split.sacrificialVault
            : split.protectedVault;
        expect(smallerVault).toBeLessThan(50_000n);
      }
    });

    it("should return 0n when seizedFraction * safetyMargin >= 1", () => {
      // Can't split — sacrificial would consume the entire deposit
      const result = computeMinDepositForSplit({
        minPegin: 50_000n,
        seizedFraction: 1.0,
        safetyMargin: 1.05,
      });
      expect(result).toBe(0n);
    });

    it("should return 0n when seizedFraction is 0", () => {
      // No seizure expected — split is not useful
      const result = computeMinDepositForSplit({
        minPegin: 50_000n,
        seizedFraction: 0,
        safetyMargin: 1.05,
      });
      expect(result).toBe(0n);
    });
  });

  describe("checkRebalanceNeeded", () => {
    it("should report no rebalance when sacrificial vault covers target", () => {
      // 10 BTC total, sacrificial ≈ 4.18 BTC is sufficient
      const result = checkRebalanceNeeded({
        vaultAmounts: [500_000_000n, 500_000_000n], // 5 BTC each
        ...DEFAULT_PARAMS,
      });

      // target ≈ 10 * 0.398 * 1.05 ≈ 4.18 BTC = 418M sats
      // current = 500M sats > 418M sats
      expect(result.needsRebalance).toBe(false);
      expect(result.deficit).toBe(0n);
    });

    it("should report rebalance needed when sacrificial vault is too small", () => {
      // 10 BTC total, sacrificial = 3 BTC (below ~4.18 BTC target)
      const result = checkRebalanceNeeded({
        vaultAmounts: [300_000_000n, 700_000_000n],
        ...DEFAULT_PARAMS,
      });

      expect(result.needsRebalance).toBe(true);
      expect(result.deficit).toBeGreaterThan(0n);
      expect(result.currentCoverage).toBe(300_000_000n);
      // target ≈ 418M sats
      expect(Number(result.targetCoverage)).toBeCloseTo(418_000_000, -6);
    });

    it("should compute correct deficit amount", () => {
      const result = checkRebalanceNeeded({
        vaultAmounts: [300_000_000n, 700_000_000n],
        ...DEFAULT_PARAMS,
      });

      expect(result.deficit).toBe(
        result.targetCoverage - result.currentCoverage,
      );
    });

    it("should return false for single vault whose total exceeds target coverage", () => {
      const result = checkRebalanceNeeded({
        vaultAmounts: [1_000_000_000n],
        ...DEFAULT_PARAMS,
      });

      // Single vault of 10 BTC. Target coverage ≈ 4.18 BTC.
      // Current coverage = 10 BTC > 4.18 BTC, so actually no rebalance needed.
      expect(result.needsRebalance).toBe(false);
    });

    it("should handle empty vault array", () => {
      const result = checkRebalanceNeeded({
        vaultAmounts: [],
        ...DEFAULT_PARAMS,
      });

      expect(result.needsRebalance).toBe(false);
      expect(result.deficit).toBe(0n);
      expect(result.currentCoverage).toBe(0n);
      expect(result.targetCoverage).toBe(0n);
    });

    it("should handle 3+ vaults (uses only first vault as sacrificial)", () => {
      const result = checkRebalanceNeeded({
        vaultAmounts: [200_000_000n, 300_000_000n, 500_000_000n],
        ...DEFAULT_PARAMS,
      });

      // Total = 10 BTC, target ≈ 4.18 BTC, current = 2 BTC → deficit
      expect(result.needsRebalance).toBe(true);
      expect(result.currentCoverage).toBe(200_000_000n);
    });
  });
});
