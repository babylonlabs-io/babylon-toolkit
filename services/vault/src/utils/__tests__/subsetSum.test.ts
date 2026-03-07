/**
 * Tests for subset sum utilities used in collateral vault selection.
 */

import { describe, expect, it } from "vitest";

import {
  btcToSatoshis,
  calculateSubsetSums,
  findVaultIndicesForAmount,
} from "../subsetSum";

const sats = (btc: number) => btcToSatoshis(btc);

describe("subsetSum", () => {
  describe("findVaultIndicesForAmount", () => {
    const vaults_01_015_02 = [sats(0.1), sats(0.15), sats(0.2)];

    it("returns [] for target 0", () => {
      expect(findVaultIndicesForAmount(vaults_01_015_02, 0n)).toEqual([]);
    });

    it("returns null when no combination sums to target", () => {
      expect(findVaultIndicesForAmount(vaults_01_015_02, sats(0.05))).toBeNull();
      expect(findVaultIndicesForAmount(vaults_01_015_02, sats(0.12))).toBeNull();
    });

    it("finds single-vault selection", () => {
      expect(findVaultIndicesForAmount(vaults_01_015_02, sats(0.1))).toEqual([
        0,
      ]);
      expect(findVaultIndicesForAmount(vaults_01_015_02, sats(0.15))).toEqual([
        1,
      ]);
      expect(findVaultIndicesForAmount(vaults_01_015_02, sats(0.2))).toEqual([
        2,
      ]);
    });

    it("finds 0.1 + 0.15 for 0.25 BTC (regression: Deposit did nothing)", () => {
      const result = findVaultIndicesForAmount(
        vaults_01_015_02,
        sats(0.25),
      );
      expect(result).toEqual([0, 1]);
      const sum = result!.reduce(
        (acc, i) => acc + vaults_01_015_02[i],
        0n,
      );
      expect(sum).toBe(sats(0.25));
    });

    it("finds 0.1 + 0.2 for 0.3 BTC", () => {
      expect(findVaultIndicesForAmount(vaults_01_015_02, sats(0.3))).toEqual([
        0, 2,
      ]);
    });

    it("finds 0.15 + 0.2 for 0.35 BTC", () => {
      expect(findVaultIndicesForAmount(vaults_01_015_02, sats(0.35))).toEqual([
        1, 2,
      ]);
    });

    it("finds all three vaults for 0.45 BTC", () => {
      expect(findVaultIndicesForAmount(vaults_01_015_02, sats(0.45))).toEqual([
        0, 1, 2,
      ]);
    });

    it("finds combination when multiple subsets could sum to target", () => {
      const vaults = [sats(0.5), sats(0.3), sats(0.2)];
      expect(findVaultIndicesForAmount(vaults, sats(0.3))).toEqual([1]);
      expect(findVaultIndicesForAmount(vaults, sats(0.2))).toEqual([2]);
      const for05 = findVaultIndicesForAmount(vaults, sats(0.5));
      expect(for05).not.toBeNull();
      const sum = for05!.reduce((acc, i) => acc + vaults[i], 0n);
      expect(sum).toBe(sats(0.5));
    });
  });

  describe("btcToSatoshis / calculateSubsetSums", () => {
    it("btcToSatoshis rounds correctly", () => {
      expect(btcToSatoshis(0.25)).toBe(25_000_000n);
      expect(btcToSatoshis(0.1)).toBe(10_000_000n);
    });

    it("calculateSubsetSums includes 0.25 for vaults [0.1, 0.15, 0.2]", () => {
      const sums = calculateSubsetSums([
        sats(0.1),
        sats(0.15),
        sats(0.2),
      ]);
      expect(sums).toContain(sats(0.25));
    });
  });
});
