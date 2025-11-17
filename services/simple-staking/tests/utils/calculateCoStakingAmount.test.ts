import { calculateCoStakingAmount } from "@/ui/common/utils/calculateCoStakingAmount";
import type { PersonalizedAPRResponse } from "@/ui/common/types/api/coStaking";

describe("calculateCoStakingAmount", () => {
  // Helper to create mock APR data
  const createMockAprData = (
    coStakingApr: number,
    btcStakingApr: number,
    totalApr: number,
  ): PersonalizedAPRResponse["data"] => ({
    current: {
      co_staking_apr: coStakingApr,
      btc_staking_apr: btcStakingApr,
      baby_staking_apr: 0,
      total_apr: totalApr,
    },
    additional_baby_needed_for_boost: 0,
    boost: {
      co_staking_apr: 0,
      btc_staking_apr: 0,
      baby_staking_apr: 0,
      total_apr: 0,
    },
    btc_staking_apr: 0,
    max_staking_apr: 0,
  });

  describe("returns base values when APR data is unavailable", () => {
    it("should return all rewards as base BTC when rawAprData is null", () => {
      const result = calculateCoStakingAmount(100, null);

      expect(result.coStakingAmountBaby).toBe(0);
      expect(result.baseBtcRewardBaby).toBe(100);
    });

    it("should return all rewards as base BTC when current APR data is missing", () => {
      const invalidData = {
        current: undefined,
        additional_baby_needed_for_boost: 0,
        boost: {
          co_staking_apr: 0,
          btc_staking_apr: 0,
          baby_staking_apr: 0,
          total_apr: 0,
        },
      } as any;

      const result = calculateCoStakingAmount(100, invalidData);

      expect(result.coStakingAmountBaby).toBe(0);
      expect(result.baseBtcRewardBaby).toBe(100);
    });
  });

  describe("returns base values for invalid APR values", () => {
    it("should return all rewards as base BTC when co_staking_apr is 0", () => {
      const aprData = createMockAprData(0, 5, 5);
      const result = calculateCoStakingAmount(100, aprData);

      expect(result.coStakingAmountBaby).toBe(0);
      expect(result.baseBtcRewardBaby).toBe(100);
    });

    it("should return all rewards as base BTC when total_apr is 0", () => {
      const aprData = createMockAprData(10, 5, 0);
      const result = calculateCoStakingAmount(100, aprData);

      expect(result.coStakingAmountBaby).toBe(0);
      expect(result.baseBtcRewardBaby).toBe(100);
    });

    it("should return all rewards as base BTC when total_apr is negative", () => {
      const aprData = createMockAprData(10, 5, -15);
      const result = calculateCoStakingAmount(100, aprData);

      expect(result.coStakingAmountBaby).toBe(0);
      expect(result.baseBtcRewardBaby).toBe(100);
    });

    it("should return all rewards as base BTC when total_apr is not finite", () => {
      const aprData = createMockAprData(10, 5, Infinity);
      const result = calculateCoStakingAmount(100, aprData);

      expect(result.coStakingAmountBaby).toBe(0);
      expect(result.baseBtcRewardBaby).toBe(100);
    });
  });

  describe("calculates split correctly with valid APR data", () => {
    it("should split rewards when co-staking APR is present", () => {
      // co_staking_apr: 10%, btc_staking_apr: 5%, total_apr: 15%
      // co-staking ratio: 10/15 = 66.67%
      // btc ratio: 5/15 = 33.33%
      const aprData = createMockAprData(10, 5, 15);
      const result = calculateCoStakingAmount(100, aprData);

      expect(result.coStakingAmountBaby).toBeCloseTo(66.666667, 5);
      expect(result.baseBtcRewardBaby).toBeCloseTo(33.333333, 5);
      expect(result.coStakingAmountBaby + result.baseBtcRewardBaby).toBeCloseTo(
        100,
        5,
      );
    });

    it("should handle case where co-staking APR is higher than BTC APR", () => {
      // co_staking_apr: 20%, btc_staking_apr: 5%, total_apr: 25%
      // co-staking ratio: 20/25 = 80%
      // btc ratio: 5/25 = 20%
      const aprData = createMockAprData(20, 5, 25);
      const result = calculateCoStakingAmount(200, aprData);

      expect(result.coStakingAmountBaby).toBeCloseTo(160, 5);
      expect(result.baseBtcRewardBaby).toBeCloseTo(40, 5);
    });

    it("should handle case where co-staking APR is lower than BTC APR", () => {
      // co_staking_apr: 3%, btc_staking_apr: 7%, total_apr: 10%
      // co-staking ratio: 3/10 = 30%
      // btc ratio: 7/10 = 70%
      const aprData = createMockAprData(3, 7, 10);
      const result = calculateCoStakingAmount(100, aprData);

      expect(result.coStakingAmountBaby).toBeCloseTo(30, 5);
      expect(result.baseBtcRewardBaby).toBeCloseTo(70, 5);
    });

    it("should handle very small BTC rewards", () => {
      const aprData = createMockAprData(10, 5, 15);
      const result = calculateCoStakingAmount(0.000001, aprData);

      expect(result.coStakingAmountBaby).toBeGreaterThanOrEqual(0);
      expect(result.baseBtcRewardBaby).toBeGreaterThanOrEqual(0);
      expect(result.coStakingAmountBaby + result.baseBtcRewardBaby).toBeCloseTo(
        0.000001,
        6,
      );
    });

    it("should handle large BTC rewards", () => {
      const aprData = createMockAprData(15, 10, 25);
      const result = calculateCoStakingAmount(10000, aprData);

      expect(result.coStakingAmountBaby).toBeCloseTo(6000, 5);
      expect(result.baseBtcRewardBaby).toBeCloseTo(4000, 5);
    });
  });

  describe("handles decimal precision", () => {
    it("should limit results to 6 decimal places", () => {
      const aprData = createMockAprData(7.123456789, 3.987654321, 11.111111);
      const result = calculateCoStakingAmount(0.123456789, aprData);

      const getDecimalLength = (value: number) => {
        const [, fraction] = value.toString().split(".");
        return fraction?.length ?? 0;
      };

      expect(getDecimalLength(result.coStakingAmountBaby)).toBeLessThanOrEqual(
        6,
      );
      expect(getDecimalLength(result.baseBtcRewardBaby)).toBeLessThanOrEqual(6);
    });

    it("should ensure sum equals total reward across multiple scenarios", () => {
      const testCases = [
        { btc: 50, coApr: 10, btcApr: 5, totalApr: 15 },
        { btc: 100, coApr: 8, btcApr: 7, totalApr: 15 },
        { btc: 1000, coApr: 12.5, btcApr: 7.5, totalApr: 20 },
      ];

      testCases.forEach((testCase) => {
        const aprData = createMockAprData(
          testCase.coApr,
          testCase.btcApr,
          testCase.totalApr,
        );
        const result = calculateCoStakingAmount(testCase.btc, aprData);

        const sum = result.coStakingAmountBaby + result.baseBtcRewardBaby;
        // Allow for small floating point differences due to rounding
        expect(Math.abs(sum - testCase.btc)).toBeLessThan(0.000001);
      });
    });
  });

  describe("edge cases", () => {
    it("should return zero amounts when btcRewardBaby is 0", () => {
      const aprData = createMockAprData(10, 5, 15);
      const result = calculateCoStakingAmount(0, aprData);

      expect(result.coStakingAmountBaby).toBe(0);
      expect(result.baseBtcRewardBaby).toBe(0);
    });

    it("should handle very high co-staking APR ratio", () => {
      // co_staking_apr: 95%, btc_staking_apr: 5%, total_apr: 100%
      const aprData = createMockAprData(95, 5, 100);
      const result = calculateCoStakingAmount(100, aprData);

      expect(result.coStakingAmountBaby).toBeCloseTo(95, 5);
      expect(result.baseBtcRewardBaby).toBeCloseTo(5, 5);
    });

    it("should handle equal co-staking and BTC APR", () => {
      // co_staking_apr: 10%, btc_staking_apr: 10%, total_apr: 20%
      const aprData = createMockAprData(10, 10, 20);
      const result = calculateCoStakingAmount(100, aprData);

      expect(result.coStakingAmountBaby).toBeCloseTo(50, 5);
      expect(result.baseBtcRewardBaby).toBeCloseTo(50, 5);
    });

    it("should handle decimal APR values", () => {
      // co_staking_apr: 7.5%, btc_staking_apr: 2.5%, total_apr: 10%
      const aprData = createMockAprData(7.5, 2.5, 10);
      const result = calculateCoStakingAmount(100, aprData);

      expect(result.coStakingAmountBaby).toBeCloseTo(75, 5);
      expect(result.baseBtcRewardBaby).toBeCloseTo(25, 5);
    });
  });
});
