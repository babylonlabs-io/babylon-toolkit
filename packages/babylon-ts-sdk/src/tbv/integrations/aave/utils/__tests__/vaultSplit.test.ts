/**
 * Tests for vault split calculation utilities
 */

import { describe, expect, it } from "vitest";

import {
  computeLiquidationBonusBps,
  computeMinDepositForSplit,
  computeOptimalSplit,
  computeSeizedFraction,
  computeSeizedFractionDetailed,
  computeSplitLiquidationBonus,
  EXPECTED_HEALTH_FACTOR_AT_LIQUIDATION,
  EXPECTED_HEALTH_FACTOR_AT_LIQUIDATION_WAD,
  findSplitSizingViolation,
  SPLIT_TARGET_HEALTH_FACTOR,
} from "../vaultSplit.js";

// Generic formula fixture (seized fraction ≈ 0.398). The launch values are
// covered in "launch split sizing" below.
const DEFAULT_PARAMS = {
  CF: 0.75,
  LB: 1.05,
  THF: 1.1,
  expectedHF: 0.95,
};

// Aave v4 bonus curve as configured for the vault BTC reserve: 5.55% max
// bonus, 90% of it still applying at HF 1.0, max bonus at HF 0.90.
const BONUS_CURVE = {
  healthFactorForMaxBonus: 900_000_000_000_000_000n,
  liquidationBonusFactor: 9_000n,
  maxLiquidationBonus: 10_555n,
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

      // seized_fraction ≈ 0.3979; sacrificial = ceil(10 BTC × 0.3979)
      expect(result.seizedFraction).toBeCloseTo(0.398, 2);
      expect(result.sacrificialVault).toBe(397_894_737n);
      expect(result.protectedVault).toBe(602_105_263n);
      expect(result.targetSeizureBtc).toBe(397_894_737n);
      expect(result.sizingViolation).toBeNull();
    });

    it("should return zero vaults for zero amount", () => {
      const result = computeOptimalSplit({
        totalBtc: 0n,
        ...DEFAULT_PARAMS,
      });

      expect(result.sacrificialVault).toBe(0n);
      expect(result.protectedVault).toBe(0n);
      expect(result.targetSeizureBtc).toBe(0n);
      // The seized fraction is a property of the parameters, not of the
      // amount, so every refusal reports the same value rather than zeroing
      // it on this branch alone.
      expect(result.seizedFraction).toBeCloseTo(0.398, 2);
      // A null violation always means two usable vaults, so a zero deposit
      // must report one.
      expect(result.sizingViolation).toBe("below-dust");
    });

    it("should return zero vaults for negative amount", () => {
      const result = computeOptimalSplit({
        totalBtc: -100n,
        ...DEFAULT_PARAMS,
      });

      expect(result.sacrificialVault).toBe(0n);
      expect(result.protectedVault).toBe(0n);
    });

    it("refuses the split when THF <= LB × CF (one liquidation takes everything)", () => {
      // liq_penalty = 1.5 × 0.75 = 1.125 > THF 1.10
      const result = computeOptimalSplit({
        totalBtc: 500_000_000n,
        CF: 0.75,
        LB: 1.5,
        THF: 1.1,
        expectedHF: 0.95,
      });

      expect(result.sacrificialVault).toBe(0n);
      expect(result.protectedVault).toBe(0n);
      expect(result.seizedFraction).toBe(1);
      expect(result.sizingViolation).toBe(
        "target-not-above-liquidation-penalty",
      );
    });

    it("refuses the split when expectedHF >= THF", () => {
      const result = computeOptimalSplit({
        totalBtc: 1_000_000_000n,
        CF: 0.75,
        LB: 1.05,
        THF: 1.1,
        expectedHF: 1.2,
      });

      expect(result.sacrificialVault).toBe(0n);
      expect(result.protectedVault).toBe(0n);
      expect(result.sizingViolation).toBe("target-not-above-expected-hf");
    });

    it("refuses the split when the sacrificial vault would not be smaller", () => {
      // THF 1.24, eHF 0.99, LB 1.0555, CF 84.5% → seized fraction ≈ 0.647
      const result = computeOptimalSplit({
        totalBtc: 1_000_000_000n,
        CF: 0.845,
        LB: 1.0555,
        THF: 1.24,
        expectedHF: 0.99,
      });

      expect(result.seizedFraction).toBeGreaterThanOrEqual(0.5);
      expect(result.sacrificialVault).toBe(0n);
      expect(result.protectedVault).toBe(0n);
      expect(result.sizingViolation).toBe("sacrificial-not-smaller");
    });

    it("refuses the split when rounding up leaves the sacrificial vault not smaller", () => {
      // Seized fraction ≈ 0.465; ceil(3 × 0.465) = 2 leaves 1 for the protected vault
      const result = computeOptimalSplit({
        totalBtc: 3n,
        CF: 0.86,
        LB: 1.0504,
        THF: 1.08,
        expectedHF: 0.99,
      });

      expect(result.seizedFraction).toBeLessThan(0.5);
      expect(result.sacrificialVault).toBe(0n);
      expect(result.protectedVault).toBe(0n);
      expect(result.sizingViolation).toBe("sacrificial-not-smaller");
    });

    it("reports the parameter violation, not dust, when both would apply", () => {
      // A zero deposit is dust and CF 0 seizes nothing. The parameter verdict
      // wins, so the caller is told what it can act on.
      const result = computeOptimalSplit({
        totalBtc: 0n,
        ...DEFAULT_PARAMS,
        CF: 0,
      });

      expect(result.sizingViolation).toBe("no-seizure-expected");
    });

    it("never reports a usable split with a zero-amount vault", () => {
      // The postcondition a public consumer relies on: a null violation means
      // two positive amounts that sum to the deposit.
      const amounts = [0n, 100n, 1_999n, 100_000n, 1_000_000_000n];
      const paramSets = [
        DEFAULT_PARAMS,
        { ...DEFAULT_PARAMS, CF: 0 },
        { ...DEFAULT_PARAMS, expectedHF: 1.2 },
      ];

      for (const totalBtc of amounts) {
        for (const params of paramSets) {
          const result = computeOptimalSplit({ totalBtc, ...params });
          if (result.sizingViolation === null) {
            expect(result.sacrificialVault).toBeGreaterThan(0n);
            expect(result.protectedVault).toBeGreaterThan(0n);
            expect(result.sacrificialVault + result.protectedVault).toBe(
              totalBtc,
            );
          } else {
            expect(result.sacrificialVault).toBe(0n);
            expect(result.protectedVault).toBe(0n);
          }
        }
      }
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
      // totalBtc = 100 sats → sacrificial 40 sats, protected 60 sats
      // Both are well below the 2000 sat HTLC dust threshold
      const result = computeOptimalSplit({
        totalBtc: 100n,
        ...DEFAULT_PARAMS,
      });

      expect(result.sacrificialVault).toBe(0n);
      expect(result.protectedVault).toBe(0n);
      expect(result.targetSeizureBtc).toBe(0n);
      expect(result.sizingViolation).toBe("below-dust");
    });

    it("refuses the split when no seizure is expected at all", () => {
      // CF 0 → seized fraction 0: a sacrificial vault would be empty, so the
      // split would protect nothing. Reported as a parameter verdict, so the
      // deposit form can explain it.
      const result = computeOptimalSplit({
        totalBtc: 1_000_000n,
        CF: 0,
        LB: 1.05,
        THF: 1.1,
        expectedHF: 0.95,
      });

      expect(result.sacrificialVault).toBe(0n);
      expect(result.protectedVault).toBe(0n);
      expect(result.targetSeizureBtc).toBe(0n);
      expect(result.sizingViolation).toBe("no-seizure-expected");
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

    it("returns 0n when the sacrificial vault would not be smaller than the protected one", () => {
      const result = computeMinDepositForSplit({
        minPegin: 50_000n,
        seizedFraction: 0.5,
      });
      expect(result).toBe(0n);
    });

    it("should return 0n when seizedFraction is 0", () => {
      // No seizure expected — split is not useful
      const result = computeMinDepositForSplit({
        minPegin: 50_000n,
        seizedFraction: 0,
      });
      expect(result).toBe(0n);
    });

    it("sizes the minimum from the sacrificial share", () => {
      // 50_000 / 0.2857 = 175_008.75, rounded up
      const result = computeMinDepositForSplit({
        minPegin: 50_000n,
        seizedFraction: 0.2857,
      });
      expect(result).toBe(175_009n);
    });
  });

  describe("launch split sizing", () => {
    // Split risk model (babylon-toolkit#2577): THF 1.08, expected HF 0.99,
    // bonus at HF 0.99 = 105.04%, no extra buffer.
    const launchBonus = computeSplitLiquidationBonus(
      {
        healthFactorForMaxBonus: BONUS_CURVE.healthFactorForMaxBonus,
        liquidationBonusFactor: BONUS_CURVE.liquidationBonusFactor,
      },
      10_555,
    );

    it("sizes against the launch curve's bonus at HF 0.99, 105.04%", () => {
      expect(launchBonus).toBe(1.0504);
    });

    it("keeps the expected-HF number and WAD constants equal", () => {
      expect(EXPECTED_HEALTH_FACTOR_AT_LIQUIDATION).toBe(0.99);
      expect(EXPECTED_HEALTH_FACTOR_AT_LIQUIDATION_WAD).toBe(
        990_000_000_000_000_000n,
      );
    });

    it("matches the model's sacrificial share at CF 78%, 85% and 86%", () => {
      const shareAt = (CF: number) =>
        computeSeizedFraction(
          CF,
          launchBonus,
          SPLIT_TARGET_HEALTH_FACTOR,
          EXPECTED_HEALTH_FACTOR_AT_LIQUIDATION,
        );

      expect(shareAt(0.78)).toBeCloseTo(0.28572, 5);
      expect(shareAt(0.85)).toBeCloseTo(0.43368, 5);
      expect(shareAt(0.86)).toBeCloseTo(0.46487, 5);
    });

    it("splits 10 BTC at CF 78% into 2.857 BTC and 7.143 BTC", () => {
      const result = computeOptimalSplit({
        totalBtc: 1_000_000_000n,
        CF: 0.78,
        LB: launchBonus,
        THF: SPLIT_TARGET_HEALTH_FACTOR,
        expectedHF: EXPECTED_HEALTH_FACTOR_AT_LIQUIDATION,
      });

      expect(result.sacrificialVault).toBe(285_716_677n);
      expect(result.protectedVault).toBe(714_283_323n);
      expect(result.sizingViolation).toBeNull();
    });

    it("refuses the split at CF 87%, where the sacrificial share passes 50%", () => {
      expect(
        findSplitSizingViolation({
          CF: 0.87,
          LB: launchBonus,
          THF: SPLIT_TARGET_HEALTH_FACTOR,
          expectedHF: EXPECTED_HEALTH_FACTOR_AT_LIQUIDATION,
        }),
      ).toBe("sacrificial-not-smaller");
    });
  });

  describe("computeLiquidationBonusBps", () => {
    it("returns the minimum bonus at HF 1.0", () => {
      // min = (10555 − 10000) × 9000 / 10000 + 10000 = 10499 (499.5 rounds down)
      expect(computeLiquidationBonusBps(BONUS_CURVE, 10n ** 18n)).toBe(10_499n);
    });

    it("interpolates linearly, rounding down, between HF 1.0 and the max-bonus HF", () => {
      expect(
        computeLiquidationBonusBps(BONUS_CURVE, 990_000_000_000_000_000n),
      ).toBe(10_504n);
      expect(
        computeLiquidationBonusBps(BONUS_CURVE, 950_000_000_000_000_000n),
      ).toBe(10_527n);
    });

    it("returns the max bonus at and below healthFactorForMaxBonus", () => {
      expect(
        computeLiquidationBonusBps(BONUS_CURVE, 900_000_000_000_000_000n),
      ).toBe(10_555n);
      expect(
        computeLiquidationBonusBps(BONUS_CURVE, 500_000_000_000_000_000n),
      ).toBe(10_555n);
    });

    it("throws above HF 1.0, where the contract reverts", () => {
      expect(() =>
        computeLiquidationBonusBps(BONUS_CURVE, 10n ** 18n + 1n),
      ).toThrow(RangeError);
    });

    it("throws when healthFactorForMaxBonus is not below 1e18", () => {
      expect(() =>
        computeLiquidationBonusBps(
          { ...BONUS_CURVE, healthFactorForMaxBonus: 10n ** 18n },
          990_000_000_000_000_000n,
        ),
      ).toThrow(RangeError);
    });

    it("throws when liquidationBonusFactor is above 100%", () => {
      expect(() =>
        computeLiquidationBonusBps(
          { ...BONUS_CURVE, liquidationBonusFactor: 10_001n },
          990_000_000_000_000_000n,
        ),
      ).toThrow(RangeError);
    });

    it("throws when maxLiquidationBonus is below 100%", () => {
      expect(() =>
        computeLiquidationBonusBps(
          { ...BONUS_CURVE, maxLiquidationBonus: 9_999n },
          990_000_000_000_000_000n,
        ),
      ).toThrow(RangeError);
    });
  });

  describe("findSplitSizingViolation", () => {
    const VALID = { CF: 0.78, LB: 1.0504, THF: 1.08, expectedHF: 0.99 };

    it("accepts the launch parameters", () => {
      expect(findSplitSizingViolation(VALID)).toBeNull();
    });

    it("flags THF equal to the expected HF", () => {
      expect(findSplitSizingViolation({ ...VALID, THF: 0.99 })).toBe(
        "target-not-above-expected-hf",
      );
    });

    it("flags THF equal to LB × CF", () => {
      // LB × CF = 1.08 when LB = 1.08 / 0.78
      expect(findSplitSizingViolation({ ...VALID, LB: 1.08 / 0.78 })).toBe(
        "target-not-above-liquidation-penalty",
      );
    });

    it("flags parameters under which nothing would be seized", () => {
      expect(findSplitSizingViolation({ ...VALID, CF: 0 })).toBe(
        "no-seizure-expected",
      );
    });

    it("flags a NaN input instead of letting it through", () => {
      expect(findSplitSizingViolation({ ...VALID, THF: Number.NaN })).toBe(
        "target-not-above-expected-hf",
      );
    });
  });

});
