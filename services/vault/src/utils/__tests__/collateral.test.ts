import { describe, expect, it } from "vitest";

import type { AavePositionCollateral } from "@/applications/aave/services/fetchPositions";

import { toCollateralVaultEntries } from "../collateral";

function makeCollateral(
  overrides: Partial<AavePositionCollateral> = {},
): AavePositionCollateral {
  return {
    id: "pos1-vault1",
    positionId: "pos1",
    vaultId: "vault1",
    amount: 100000000n, // 1 BTC
    addedAt: 1700000000n,
    removedAt: null,
    vault: { id: "vault1", amount: 100000000n, status: "active" },
    ...overrides,
  };
}

describe("Collateral Utilities", () => {
  describe("toCollateralVaultEntries", () => {
    it("should convert active collaterals to vault entries", () => {
      const collaterals = [makeCollateral()];
      const result = toCollateralVaultEntries(collaterals);

      expect(result).toEqual([
        {
          id: "pos1-vault1",
          vaultId: "vault1",
          amountBtc: 1,
          addedAt: 1700000000,
        },
      ]);
    });

    it("should filter out removed collaterals", () => {
      const collaterals = [
        makeCollateral(),
        makeCollateral({
          id: "pos1-vault2",
          vaultId: "vault2",
          removedAt: 1700001000n,
        }),
      ];
      const result = toCollateralVaultEntries(collaterals);

      expect(result).toHaveLength(1);
      expect(result[0].vaultId).toBe("vault1");
    });

    it("should filter out liquidated vaults", () => {
      const collaterals = [
        makeCollateral({
          vault: { id: "vault1", amount: 100000000n, status: "liquidated" },
        }),
      ];
      const result = toCollateralVaultEntries(collaterals);

      expect(result).toHaveLength(0);
    });

    it("should filter out depositor_withdrawn vaults", () => {
      const collaterals = [
        makeCollateral({
          vault: {
            id: "vault1",
            amount: 100000000n,
            status: "depositor_withdrawn",
          },
        }),
      ];
      const result = toCollateralVaultEntries(collaterals);

      expect(result).toHaveLength(0);
    });

    it("should keep collaterals with no vault data", () => {
      const collaterals = [makeCollateral({ vault: undefined })];
      const result = toCollateralVaultEntries(collaterals);

      expect(result).toHaveLength(1);
    });

    it("should return empty array for empty input", () => {
      expect(toCollateralVaultEntries([])).toEqual([]);
    });

    it("should convert satoshi amounts to BTC", () => {
      const collaterals = [makeCollateral({ amount: 50000000n })]; // 0.5 BTC
      const result = toCollateralVaultEntries(collaterals);

      expect(result[0].amountBtc).toBe(0.5);
    });
  });
});
