/**
 * Tests for deposit transformer functions
 */

import { describe, expect, it } from "vitest";

import {
  ContractStatus,
  LocalStorageStatus,
  getPeginState,
} from "../../../models/peginStateMachine";
import {
  formatSatoshisToBtc,
  parseBtcToSatoshis,
} from "../../../utils/btcConversion";
import {
  transformFormToTransactionData,
  type DepositFormData,
} from "../transformers";

describe("Deposit Transformers", () => {
  describe("transformFormToTransactionData", () => {
    it("should transform form data to transaction data correctly", () => {
      const formData: DepositFormData = {
        amount: "0.001",
        selectedProviders: ["0xProvider123"],
      };

      const walletData = {
        btcPubkey: "0xBtcPubkey123",
        ethAddress: "0xEthAddress123" as any,
      };

      const providerData = {
        address: "0xProvider123" as any,
        btcPubkey: "0xProviderBtcKey",
        vaultKeeperPubkeys: ["0xVaultKeeper1", "0xVaultKeeper2"],
        universalChallengerPubkeys: ["0xUniversalChallenger1"],
      };

      const utxoData = {
        selectedUTXOs: [
          { txid: "0x123", vout: 0, value: 100000, scriptPubKey: "0xabc" },
        ],
        fee: 1000n,
      };

      const result = transformFormToTransactionData(
        formData,
        walletData,
        providerData,
        utxoData,
      );

      expect(result.depositorBtcPubkey).toBe("0xBtcPubkey123");
      expect(result.depositorEthAddress).toBe("0xEthAddress123");
      expect(result.pegInAmount).toBe(100000n);
      expect(result.vaultProviderAddress).toBe("0xProvider123");
      expect(result.vaultProviderBtcPubkey).toBe("0xProviderBtcKey");
      expect(result.vaultKeeperBtcPubkeys).toHaveLength(2);
      expect(result.universalChallengerBtcPubkeys).toHaveLength(1);
      expect(result.selectedUTXOs).toHaveLength(1);
      expect(result.fee).toBe(1000n);
      expect(result.unsignedTxHex).toBeUndefined();
    });
  });

  describe("getPeginState (status to label transformation)", () => {
    it("should map contract status to correct label", () => {
      expect(getPeginState(ContractStatus.PENDING).displayLabel).toBe(
        "Pending",
      );
      expect(getPeginState(ContractStatus.VERIFIED).displayLabel).toBe(
        "Verified",
      );
      expect(getPeginState(ContractStatus.ACTIVE).displayLabel).toBe(
        "Available",
      );
      expect(
        getPeginState(ContractStatus.ACTIVE, { isInUse: true }).displayLabel,
      ).toBe("In Use");
      expect(getPeginState(ContractStatus.REDEEMED).displayLabel).toBe(
        "Redeem in Progress",
      );
      expect(getPeginState(ContractStatus.LIQUIDATED).displayLabel).toBe(
        "Liquidated",
      );
      expect(getPeginState(ContractStatus.INVALID).displayLabel).toBe(
        "Invalid",
      );
      expect(
        getPeginState(ContractStatus.DEPOSITOR_WITHDRAWN).displayLabel,
      ).toBe("Redeemed");
    });

    it("should prioritize local status when present", () => {
      expect(
        getPeginState(ContractStatus.PENDING, {
          localStatus: LocalStorageStatus.CONFIRMING,
        }).displayLabel,
      ).toBe("Pending"); // Note: CONFIRMING is only used with VERIFIED status in state machine

      expect(
        getPeginState(ContractStatus.PENDING, {
          localStatus: LocalStorageStatus.PAYOUT_SIGNED,
        }).displayLabel,
      ).toBe("Processing");

      // Test the actual case where CONFIRMING is used
      expect(
        getPeginState(ContractStatus.VERIFIED, {
          localStatus: LocalStorageStatus.CONFIRMING,
        }).displayLabel,
      ).toBe("Confirming");
    });

    it("should handle undefined local status", () => {
      expect(getPeginState(ContractStatus.ACTIVE).displayLabel).toBe(
        "Available",
      );
    });

    it("should return Unknown for invalid status", () => {
      expect(getPeginState(999 as any).displayLabel).toBe("Unknown");
    });
  });

  describe("formatSatoshisToBtc", () => {
    it("should format satoshis to BTC correctly", () => {
      expect(formatSatoshisToBtc(100000000n)).toBe("1");
      expect(formatSatoshisToBtc(50000000n)).toBe("0.5");
      expect(formatSatoshisToBtc(12345678n)).toBe("0.12345678");
      expect(formatSatoshisToBtc(100000n)).toBe("0.001");
    });

    it("should handle zero", () => {
      expect(formatSatoshisToBtc(0n)).toBe("0");
    });

    it("should handle large values without precision loss", () => {
      const maxBtc = 21000000n * 100000000n;
      expect(formatSatoshisToBtc(maxBtc)).toBe("21000000");
    });

    it("should respect decimal parameter", () => {
      expect(formatSatoshisToBtc(12345678n, 2)).toBe("0.12");
      expect(formatSatoshisToBtc(12345678n, 4)).toBe("0.1234");
      expect(formatSatoshisToBtc(100000000n, 0)).toBe("1");
    });

    it("should remove trailing zeros", () => {
      expect(formatSatoshisToBtc(100000000n, 8)).toBe("1");
      expect(formatSatoshisToBtc(150000000n, 8)).toBe("1.5");
      expect(formatSatoshisToBtc(123000000n, 8)).toBe("1.23");
    });

    it("should handle values larger than Number.MAX_SAFE_INTEGER", () => {
      const largeValue = BigInt(Number.MAX_SAFE_INTEGER) * 1000n;
      const result = formatSatoshisToBtc(largeValue);

      expect(result).toBeDefined();
      expect(result).not.toContain("e"); // No scientific notation
    });
  });

  describe("parseBtcToSatoshis", () => {
    it("should parse BTC string to satoshis correctly", () => {
      expect(parseBtcToSatoshis("1")).toBe(100000000n);
      expect(parseBtcToSatoshis("0.5")).toBe(50000000n);
      expect(parseBtcToSatoshis("0.12345678")).toBe(12345678n);
      expect(parseBtcToSatoshis("0.001")).toBe(100000n);
    });

    it("should handle zero", () => {
      expect(parseBtcToSatoshis("0")).toBe(0n);
      expect(parseBtcToSatoshis("0.0")).toBe(0n);
      expect(parseBtcToSatoshis("0.00000000")).toBe(0n);
    });

    it("should handle numbers without decimal point", () => {
      expect(parseBtcToSatoshis("21")).toBe(2100000000n);
      expect(parseBtcToSatoshis("100")).toBe(10000000000n);
    });

    it("should handle leading decimal point", () => {
      expect(parseBtcToSatoshis(".5")).toBe(50000000n);
      expect(parseBtcToSatoshis(".12345678")).toBe(12345678n);
    });

    it("should truncate extra decimal places", () => {
      expect(parseBtcToSatoshis("0.123456789")).toBe(12345678n);
      expect(parseBtcToSatoshis("1.000000001")).toBe(100000000n);
    });

    it("should handle invalid input", () => {
      expect(parseBtcToSatoshis("")).toBe(0n);
      expect(parseBtcToSatoshis(".")).toBe(0n);
      expect(parseBtcToSatoshis("abc")).toBe(0n);
      expect(parseBtcToSatoshis("1.2.3")).toBe(0n);
    });

    it("should remove non-numeric characters", () => {
      expect(parseBtcToSatoshis("1,000")).toBe(100000000000n);
      expect(parseBtcToSatoshis("$1.5")).toBe(150000000n);
      expect(parseBtcToSatoshis("0.001 BTC")).toBe(100000n);
    });

    it("should handle multiple decimal points", () => {
      expect(parseBtcToSatoshis("1.2.3")).toBe(0n);
      expect(parseBtcToSatoshis("0.1.0.1")).toBe(0n);
    });
  });
});
