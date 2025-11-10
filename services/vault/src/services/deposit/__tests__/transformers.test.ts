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
  calculateDepositProgress,
  transformApiUtxoToInternal,
  transformErrorMessage,
  transformFormToTransactionData,
  transformProviderForDisplay,
  type DepositFormData,
} from "../transformers";

describe("Deposit Transformers", () => {
  describe("transformFormToTransactionData", () => {
    it("should transform form data to transaction data correctly", () => {
      const formData: DepositFormData = {
        amount: "100000",
        selectedProviders: ["0xProvider123"],
      };

      const walletData = {
        btcPubkey: "0xBtcPubkey123",
        ethAddress: "0xEthAddress123" as any,
      };

      const providerData = {
        address: "0xProvider123" as any,
        btcPubkey: "0xProviderBtcKey",
        liquidatorPubkeys: ["0xLiquidator1", "0xLiquidator2"],
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
      expect(result.liquidatorBtcPubkeys).toHaveLength(2);
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
      expect(getPeginState(ContractStatus.AVAILABLE).displayLabel).toBe(
        "Available",
      );
      expect(getPeginState(ContractStatus.IN_POSITION).displayLabel).toBe(
        "In Use",
      );
      expect(getPeginState(ContractStatus.EXPIRED).displayLabel).toBe(
        "Expired",
      );
    });

    it("should prioritize local status when present", () => {
      expect(
        getPeginState(ContractStatus.PENDING, LocalStorageStatus.CONFIRMING)
          .displayLabel,
      ).toBe("Pending"); // Note: CONFIRMING is only used with VERIFIED status in state machine

      expect(
        getPeginState(ContractStatus.PENDING, LocalStorageStatus.PAYOUT_SIGNED)
          .displayLabel,
      ).toBe("Processing");

      // Test the actual case where CONFIRMING is used
      expect(
        getPeginState(ContractStatus.VERIFIED, LocalStorageStatus.CONFIRMING)
          .displayLabel,
      ).toBe("Pending Bitcoin Confirmations");
    });

    it("should handle undefined local status", () => {
      expect(
        getPeginState(ContractStatus.AVAILABLE, undefined).displayLabel,
      ).toBe("Available");
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

  describe("transformApiUtxoToInternal", () => {
    it("should transform API UTXO format to internal format", () => {
      const apiUtxo = {
        txid: "0xabc123",
        vout: 1,
        value: 100000,
        scriptPubKey: "0xscript",
      };

      const result = transformApiUtxoToInternal(apiUtxo);

      expect(result.txid).toBe("0xabc123");
      expect(result.vout).toBe(1);
      expect(result.value).toBe(100000);
      expect(result.scriptPubKey).toBe("0xscript");
    });

    it("should handle alternative field names", () => {
      const apiUtxo = {
        tx_id: "0xdef456",
        output_index: 2,
        amount: 50000,
        script_pubkey: "0xaltscript",
      };

      const result = transformApiUtxoToInternal(apiUtxo);

      expect(result.txid).toBe("0xdef456");
      expect(result.vout).toBe(2);
      expect(result.value).toBe(50000);
      expect(result.scriptPubKey).toBe("0xaltscript");
    });

    it("should prefer primary field names over alternatives", () => {
      const apiUtxo = {
        txid: "0xprimary",
        tx_id: "0xalternative",
        vout: 1,
        output_index: 2,
        value: 100000,
        amount: 50000,
        scriptPubKey: "0xprimaryscript",
        script_pubkey: "0xaltscript",
      };

      const result = transformApiUtxoToInternal(apiUtxo);

      expect(result.txid).toBe("0xprimary");
      expect(result.vout).toBe(1);
      expect(result.value).toBe(100000);
      expect(result.scriptPubKey).toBe("0xprimaryscript");
    });
  });

  describe("transformProviderForDisplay", () => {
    it("should transform provider with name", () => {
      const provider = {
        address: "0x1234567890abcdef1234567890abcdef12345678",
        name: "Test Provider",
        btc_pub_key: "0xbtckey123",
      };

      const result = transformProviderForDisplay(provider);

      expect(result.id).toBe(provider.address);
      expect(result.name).toBe("Test Provider");
      expect(result.btcPubkey).toBe("0xbtckey123");
      expect(result.displayName).toBe("Test Provider");
    });

    it("should create display name from address when name is missing", () => {
      const provider = {
        address: "0x1234567890abcdef1234567890abcdef12345678",
        btc_pub_key: "0xbtckey456",
      };

      const result = transformProviderForDisplay(provider);

      expect(result.id).toBe(provider.address);
      expect(result.name).toBe("0x1234...5678");
      expect(result.btcPubkey).toBe("0xbtckey456");
      expect(result.displayName).toBe("Provider 0x1234...5678");
    });
  });

  describe("calculateDepositProgress", () => {
    it("should calculate correct progress for each status", () => {
      expect(calculateDepositProgress(ContractStatus.PENDING)).toBe(25);
      expect(calculateDepositProgress(ContractStatus.VERIFIED)).toBe(50);
      expect(calculateDepositProgress(ContractStatus.AVAILABLE)).toBe(100);
      expect(calculateDepositProgress(ContractStatus.IN_POSITION)).toBe(100);
      expect(calculateDepositProgress(ContractStatus.EXPIRED)).toBe(100);
    });

    it("should return 0 for unknown status", () => {
      expect(calculateDepositProgress(999 as any)).toBe(0);
      expect(calculateDepositProgress(undefined as any)).toBe(0);
    });
  });

  describe("transformErrorMessage", () => {
    it("should handle string errors", () => {
      expect(transformErrorMessage("Test error")).toBe("Test error");
    });

    it("should handle Error objects", () => {
      const error = new Error("Test error message");
      expect(transformErrorMessage(error)).toBe("Test error message");
    });

    it("should transform specific error messages", () => {
      const insufficientError = new Error("insufficient funds for transaction");
      expect(transformErrorMessage(insufficientError)).toBe(
        "Insufficient balance for this transaction",
      );

      const rejectedError = new Error("User rejected the request");
      expect(transformErrorMessage(rejectedError)).toBe(
        "Transaction was rejected",
      );

      const timeoutError = new Error("Request timeout exceeded");
      expect(transformErrorMessage(timeoutError)).toBe(
        "Request timed out. Please try again",
      );
    });

    it("should handle unknown error types", () => {
      expect(transformErrorMessage(null)).toBe("An unexpected error occurred");
      expect(transformErrorMessage(undefined)).toBe(
        "An unexpected error occurred",
      );
      expect(transformErrorMessage(123)).toBe("An unexpected error occurred");
      expect(transformErrorMessage({})).toBe("An unexpected error occurred");
    });

    it("should preserve original message for unrecognized errors", () => {
      const customError = new Error("Custom error message");
      expect(transformErrorMessage(customError)).toBe("Custom error message");
    });
  });
});
