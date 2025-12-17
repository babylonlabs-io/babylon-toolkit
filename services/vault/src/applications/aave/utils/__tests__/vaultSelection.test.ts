import { describe, expect, it } from "vitest";

import {
  calculateTotalVaultAmount,
  selectVaultsForAmount,
} from "../vaultSelection";

describe("vaultSelection utils", () => {
  describe("selectVaultsForAmount", () => {
    it("should return empty result for zero target amount", () => {
      const vaults = [
        { id: "vault-1", amount: 1.0 },
        { id: "vault-2", amount: 0.5 },
      ];

      const result = selectVaultsForAmount(vaults, 0);

      expect(result.vaultIds).toEqual([]);
      expect(result.actualAmount).toBe(0);
    });

    it("should return empty result for negative target amount", () => {
      const vaults = [{ id: "vault-1", amount: 1.0 }];

      const result = selectVaultsForAmount(vaults, -1);

      expect(result.vaultIds).toEqual([]);
      expect(result.actualAmount).toBe(0);
    });

    it("should return empty result for empty vaults array", () => {
      const result = selectVaultsForAmount([], 1.0);

      expect(result.vaultIds).toEqual([]);
      expect(result.actualAmount).toBe(0);
    });

    it("should select single vault when it covers the target", () => {
      const vaults = [
        { id: "vault-1", amount: 2.0 },
        { id: "vault-2", amount: 0.5 },
      ];

      const result = selectVaultsForAmount(vaults, 1.0);

      expect(result.vaultIds).toEqual(["vault-1"]);
      expect(result.actualAmount).toBe(2.0);
    });

    it("should select multiple vaults to meet the target", () => {
      const vaults = [
        { id: "vault-1", amount: 0.3 },
        { id: "vault-2", amount: 0.5 },
        { id: "vault-3", amount: 0.2 },
      ];

      const result = selectVaultsForAmount(vaults, 0.7);

      // Should pick largest first: vault-2 (0.5), then vault-1 (0.3) = 0.8 >= 0.7
      expect(result.vaultIds).toEqual(["vault-2", "vault-1"]);
      expect(result.actualAmount).toBe(0.8);
    });

    it("should select all vaults if target exceeds total", () => {
      const vaults = [
        { id: "vault-1", amount: 0.3 },
        { id: "vault-2", amount: 0.5 },
      ];

      const result = selectVaultsForAmount(vaults, 10.0);

      expect(result.vaultIds).toEqual(["vault-2", "vault-1"]);
      expect(result.actualAmount).toBe(0.8);
    });

    it("should use greedy algorithm (largest first)", () => {
      const vaults = [
        { id: "small", amount: 0.1 },
        { id: "medium", amount: 0.5 },
        { id: "large", amount: 1.0 },
      ];

      const result = selectVaultsForAmount(vaults, 0.5);

      // Should pick largest (1.0) first, even though medium (0.5) is exact
      expect(result.vaultIds).toEqual(["large"]);
      expect(result.actualAmount).toBe(1.0);
    });

    it("should not modify the original vaults array", () => {
      const vaults = [
        { id: "vault-1", amount: 0.3 },
        { id: "vault-2", amount: 0.5 },
      ];
      const originalOrder = vaults.map((v) => v.id);

      selectVaultsForAmount(vaults, 0.5);

      expect(vaults.map((v) => v.id)).toEqual(originalOrder);
    });
  });

  describe("calculateTotalVaultAmount", () => {
    it("should return 0 for empty array", () => {
      expect(calculateTotalVaultAmount([])).toBe(0);
    });

    it("should sum all vault amounts", () => {
      const vaults = [
        { id: "vault-1", amount: 0.3 },
        { id: "vault-2", amount: 0.5 },
        { id: "vault-3", amount: 0.2 },
      ];

      expect(calculateTotalVaultAmount(vaults)).toBe(1.0);
    });

    it("should handle single vault", () => {
      const vaults = [{ id: "vault-1", amount: 1.5 }];

      expect(calculateTotalVaultAmount(vaults)).toBe(1.5);
    });
  });
});
