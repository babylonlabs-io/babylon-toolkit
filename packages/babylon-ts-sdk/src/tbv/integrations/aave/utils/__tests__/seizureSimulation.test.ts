/**
 * Tests for seizure simulation utilities
 */

import { describe, expect, it } from "vitest";

import {
  computeTargetSeizureSats,
  simulatePrefixSeizure,
} from "../seizureSimulation.js";

const DEFAULT_RISK_PARAMS = {
  CF: 0.75,
  LB: 1.05,
  THF: 1.1,
  expectedHF: 0.95,
};

describe("seizureSimulation", () => {
  describe("computeTargetSeizureSats", () => {
    it("computes target seizure for 10 BTC with default params", () => {
      const target = computeTargetSeizureSats({
        totalCollateralSats: 1_000_000_000n,
        ...DEFAULT_RISK_PARAMS,
      });

      // seized_fraction ≈ 0.398, target ≈ 398M sats
      expect(Number(target)).toBeCloseTo(398_000_000, -6);
    });

    it("returns 0n for zero collateral", () => {
      const target = computeTargetSeizureSats({
        totalCollateralSats: 0n,
        ...DEFAULT_RISK_PARAMS,
      });

      expect(target).toBe(0n);
    });

    it("returns 0n for negative collateral", () => {
      const target = computeTargetSeizureSats({
        totalCollateralSats: -100n,
        ...DEFAULT_RISK_PARAMS,
      });

      expect(target).toBe(0n);
    });

    it("returns full collateral when full liquidation is inevitable", () => {
      // THF <= liq_penalty → seized_fraction = 1
      const target = computeTargetSeizureSats({
        totalCollateralSats: 500_000_000n,
        CF: 0.75,
        LB: 1.5,
        THF: 1.1,
        expectedHF: 0.95,
      });

      expect(target).toBe(500_000_000n);
    });

    it("returns 0n when expectedHF >= THF (no seizure)", () => {
      const target = computeTargetSeizureSats({
        totalCollateralSats: 1_000_000_000n,
        CF: 0.75,
        LB: 1.05,
        THF: 1.1,
        expectedHF: 1.2,
      });

      expect(target).toBe(0n);
    });

    it("throws RangeError when collateral exceeds Number.MAX_SAFE_INTEGER", () => {
      expect(() =>
        computeTargetSeizureSats({
          totalCollateralSats: BigInt(Number.MAX_SAFE_INTEGER) + 1n,
          ...DEFAULT_RISK_PARAMS,
        }),
      ).toThrow(RangeError);
    });
  });

  describe("simulatePrefixSeizure", () => {
    it("seizes single vault when it covers target", () => {
      const result = simulatePrefixSeizure({
        orderedVaults: [
          { id: "0xaaa", amountSats: 500_000_000n },
          { id: "0xbbb", amountSats: 500_000_000n },
        ],
        targetSeizureSats: 400_000_000n,
      });

      expect(result.seizedVaults).toHaveLength(1);
      expect(result.seizedVaults[0].id).toBe("0xaaa");
      expect(result.protectedVaults).toHaveLength(1);
      expect(result.protectedVaults[0].id).toBe("0xbbb");
      expect(result.cutoffIndex).toBe(1);
      expect(result.totalSeizedSats).toBe(500_000_000n);
      expect(result.overSeizureSats).toBe(100_000_000n);
    });

    it("seizes multiple vaults when first is insufficient", () => {
      const result = simulatePrefixSeizure({
        orderedVaults: [
          { id: "0xaaa", amountSats: 200_000_000n },
          { id: "0xbbb", amountSats: 300_000_000n },
          { id: "0xccc", amountSats: 500_000_000n },
        ],
        targetSeizureSats: 400_000_000n,
      });

      expect(result.seizedVaults).toHaveLength(2);
      expect(result.seizedVaults[0].id).toBe("0xaaa");
      expect(result.seizedVaults[1].id).toBe("0xbbb");
      expect(result.protectedVaults).toHaveLength(1);
      expect(result.protectedVaults[0].id).toBe("0xccc");
      expect(result.cutoffIndex).toBe(2);
      expect(result.totalSeizedSats).toBe(500_000_000n);
      expect(result.overSeizureSats).toBe(100_000_000n);
    });

    it("seizes all vaults when total is insufficient", () => {
      const result = simulatePrefixSeizure({
        orderedVaults: [
          { id: "0xaaa", amountSats: 100_000_000n },
          { id: "0xbbb", amountSats: 200_000_000n },
        ],
        targetSeizureSats: 500_000_000n,
      });

      expect(result.seizedVaults).toHaveLength(2);
      expect(result.protectedVaults).toHaveLength(0);
      expect(result.cutoffIndex).toBe(2);
      expect(result.totalSeizedSats).toBe(300_000_000n);
      expect(result.overSeizureSats).toBe(0n);
    });

    it("has zero over-seizure when vault amount exactly matches target", () => {
      const result = simulatePrefixSeizure({
        orderedVaults: [
          { id: "0xaaa", amountSats: 400_000_000n },
          { id: "0xbbb", amountSats: 600_000_000n },
        ],
        targetSeizureSats: 400_000_000n,
      });

      expect(result.seizedVaults).toHaveLength(1);
      expect(result.protectedVaults).toHaveLength(1);
      expect(result.overSeizureSats).toBe(0n);
      expect(result.totalSeizedSats).toBe(400_000_000n);
    });

    it("has zero over-seizure when two vaults exactly match target", () => {
      const result = simulatePrefixSeizure({
        orderedVaults: [
          { id: "0xaaa", amountSats: 150_000_000n },
          { id: "0xbbb", amountSats: 250_000_000n },
          { id: "0xccc", amountSats: 600_000_000n },
        ],
        targetSeizureSats: 400_000_000n,
      });

      expect(result.seizedVaults).toHaveLength(2);
      expect(result.protectedVaults).toHaveLength(1);
      expect(result.overSeizureSats).toBe(0n);
      expect(result.cutoffIndex).toBe(2);
    });

    it("throws when orderedVaults is empty", () => {
      expect(() =>
        simulatePrefixSeizure({
          orderedVaults: [],
          targetSeizureSats: 100n,
        }),
      ).toThrow("orderedVaults must not be empty");
    });

    it("throws when targetSeizureSats is zero", () => {
      expect(() =>
        simulatePrefixSeizure({
          orderedVaults: [{ id: "0xaaa", amountSats: 100n }],
          targetSeizureSats: 0n,
        }),
      ).toThrow("targetSeizureSats must be positive");
    });

    it("throws when targetSeizureSats is negative", () => {
      expect(() =>
        simulatePrefixSeizure({
          orderedVaults: [{ id: "0xaaa", amountSats: 100n }],
          targetSeizureSats: -100n,
        }),
      ).toThrow("targetSeizureSats must be positive");
    });

    it("preserves vault order in results", () => {
      const vaults = [
        { id: "0x111", amountSats: 100_000_000n },
        { id: "0x222", amountSats: 200_000_000n },
        { id: "0x333", amountSats: 300_000_000n },
        { id: "0x444", amountSats: 400_000_000n },
      ];

      const result = simulatePrefixSeizure({
        orderedVaults: vaults,
        targetSeizureSats: 250_000_000n,
      });

      // First two vaults seized (100M + 200M = 300M >= 250M)
      expect(result.seizedVaults.map((v) => v.id)).toEqual(["0x111", "0x222"]);
      expect(result.protectedVaults.map((v) => v.id)).toEqual([
        "0x333",
        "0x444",
      ]);
    });
  });
});
