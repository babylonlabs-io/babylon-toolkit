import { describe, expect, it } from "vitest";

import type { AavePositionCollateral } from "@/applications/aave/services/fetchPositions";
import type { VaultProvider } from "@/types/vaultProvider";

import { toCollateralVaultEntries } from "../collateral";

function makeCollateral(
  overrides: Partial<AavePositionCollateral> = {},
): AavePositionCollateral {
  return {
    depositorAddress: "0xdepositor1",
    vaultId: "vault1",
    amount: 100000000n, // 1 BTC
    addedAt: 1700000000n,
    removedAt: null,
    liquidationIndex: 0,
    vault: {
      id: "vault1",
      peginTxHash: "0xpeginTxHash1",
      amount: 100000000n,
      status: "active",
      vaultProvider: "0xprovider1",
      inUse: true,
      depositorBtcPubKey: "0xbtcpubkey1",
    },
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
          id: "0xdepositor1-vault1",
          vaultId: "vault1",
          peginTxHash: "0xpeginTxHash1",
          amountBtc: 1,
          addedAt: 1700000000,
          inUse: true,
          providerAddress: "0xprovider1",
          providerName: "0xprov...der1",
          providerIconUrl: undefined,
          depositorBtcPubkey: "0xbtcpubkey1",
          liquidationIndex: 0,
        },
      ]);
    });

    it("should filter out removed collaterals", () => {
      const collaterals = [
        makeCollateral(),
        makeCollateral({
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
          vault: {
            id: "vault1",
            peginTxHash: "0xpeginTxHash1",
            amount: 100000000n,
            status: "liquidated",
            vaultProvider: "0xprovider1",
            inUse: false,
            depositorBtcPubKey: "0xbtcpubkey1",
          },
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
            peginTxHash: "0xpeginTxHash1",
            amount: 100000000n,
            status: "depositor_withdrawn",
            vaultProvider: "0xprovider1",
            inUse: false,
            depositorBtcPubKey: "0xbtcpubkey1",
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
      expect(result[0]).toMatchObject({
        inUse: false,
        providerAddress: "",
        providerName: "",
        providerIconUrl: undefined,
        depositorBtcPubkey: undefined,
      });
    });

    it("should use findProvider to resolve provider name and icon", () => {
      const collaterals = [makeCollateral()];
      const mockProvider: VaultProvider = {
        id: "0xprovider1",
        btcPubKey: "0xabc",
        url: "https://provider.test",
        name: "Babylon Provider",
        iconUrl: "https://example.com/icon.png",
      };
      const findProvider = (address: string) =>
        address === "0xprovider1" ? mockProvider : undefined;

      const result = toCollateralVaultEntries(collaterals, findProvider);

      expect(result[0]).toMatchObject({
        providerName: "Babylon Provider",
        providerIconUrl: "https://example.com/icon.png",
      });
    });

    it("should fall back to truncated address when findProvider returns undefined", () => {
      const collaterals = [makeCollateral()];
      const findProvider = () => undefined;

      const result = toCollateralVaultEntries(collaterals, findProvider);

      expect(result[0].providerName).toBe("0xprov...der1");
      expect(result[0].providerIconUrl).toBeUndefined();
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
