import type { Address, Hex } from "viem";
import { describe, expect, it, vi } from "vitest";

import { ContractStatus } from "../../models/peginStateMachine";
import type { Vault } from "../../types/vault";
import {
  getFormattedRepayAmount,
  transformVaultToActivity,
  transformVaultsToActivities,
} from "../vaultTransformers";

vi.mock("../../config", () => ({
  getNetworkConfigBTC: () => ({
    coinSymbol: "BTC",
    icon: "btc-icon.svg",
  }),
}));

function makeVault(overrides: Partial<Vault> = {}): Vault {
  return {
    id: "0xvaultid" as Hex,
    peginTxHash: "0xpegintx" as Hex,
    depositor: "0xdepositor" as Address,
    depositorBtcPubkey: "0xpubkey" as Hex,
    depositorSignedPeginTx: "0xsignedtx" as Hex,
    amount: 100_000n,
    vaultProvider: "0xprovider" as Address,
    htlcVout: 0,
    status: ContractStatus.PENDING,
    applicationEntryPoint: "0xapp" as Address,
    appVaultKeepersVersion: 1,
    universalChallengersVersion: 1,
    offchainParamsVersion: 1,
    createdAt: 1700000000000,
    isInUse: false,
    referralCode: 0,
    depositorPayoutBtcAddress: "0xpayout" as Hex,
    depositorWotsPkHash: "0x" + "ab".repeat(32),
    ...overrides,
  };
}

describe("vaultTransformers", () => {
  describe("transformVaultToActivity", () => {
    it("maps core vault fields to activity", () => {
      const vault = makeVault();
      const activity = transformVaultToActivity(vault);

      expect(activity.id).toBe(vault.id);
      expect(activity.peginTxHash).toBe(vault.peginTxHash);
      expect(activity.contractStatus).toBe(ContractStatus.PENDING);
      expect(activity.isInUse).toBe(false);
      expect(activity.collateral.symbol).toBe("BTC");
      expect(activity.providers[0].id).toBe("0xprovider");
      expect(activity.timestamp).toBe(1700000000000);
    });

    it("maps depositorWotsPkHash correctly", () => {
      const hash = "0x" + "cd".repeat(32);
      const vault = makeVault({ depositorWotsPkHash: hash });
      const activity = transformVaultToActivity(vault);

      expect(activity.depositorWotsPkHash).toBe(hash);
    });

    it("maps optional fields from vault", () => {
      const vault = makeVault({
        depositorBtcPubkey: "0xmypubkey" as Hex,
        depositorSignedPeginTx: "0xsigned" as Hex,
        unsignedPrePeginTx: "0xunsigned" as Hex,
        expiredAt: 1700001000000,
        expirationReason: "ack_timeout" as any,
      });
      const activity = transformVaultToActivity(vault);

      expect(activity.depositorBtcPubkey).toBe("0xmypubkey");
      expect(activity.depositorSignedPeginTx).toBe("0xsigned");
      expect(activity.unsignedPrePeginTx).toBe("0xunsigned");
      expect(activity.expiredAt).toBe(1700001000000);
      expect(activity.expirationReason).toBe("ack_timeout");
    });

    it("shows expired with ack_timeout reason", () => {
      const vault = makeVault({
        status: ContractStatus.EXPIRED,
        expiredAt: 1700001000000,
        expirationReason: "ack_timeout" as any,
      });
      const activity = transformVaultToActivity(vault);

      expect(activity.contractStatus).toBe(ContractStatus.EXPIRED);
      expect(activity.displayLabel).toBe("Expired");
    });

    it("does not include position or borrowing data", () => {
      const activity = transformVaultToActivity(makeVault());

      expect(activity.position).toBeUndefined();
      expect(activity.borrowingData).toBeUndefined();
      expect(activity.marketData).toBeUndefined();
      expect(activity.action).toBeUndefined();
    });
  });

  describe("transformVaultsToActivities", () => {
    it("transforms multiple vaults", () => {
      const vaults = [
        makeVault({ id: "0x1" as Hex }),
        makeVault({ id: "0x2" as Hex }),
      ];
      const activities = transformVaultsToActivities(vaults);

      expect(activities).toHaveLength(2);
      expect(activities[0].id).toBe("0x1");
      expect(activities[1].id).toBe("0x2");
    });

    it("returns empty array for empty input", () => {
      expect(transformVaultsToActivities([])).toEqual([]);
    });
  });

  describe("getFormattedRepayAmount", () => {
    it("returns '0 USDC' when no position data", () => {
      const activity = transformVaultToActivity(makeVault());
      expect(getFormattedRepayAmount(activity)).toBe("0 USDC");
    });
  });
});
