/**
 * Tests for contract error mapping utilities
 */

import { AaveIntegrationAdapterABI } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import { type Abi, encodeErrorResult } from "viem";
import { describe, expect, it } from "vitest";

import { mapViemErrorToContractError } from "../contract";
import { ErrorCode } from "../types";

// Test ABI with custom errors
const TEST_ABI: Abi = [
  {
    type: "error",
    name: "DebtMustBeRepaidFirst",
    inputs: [],
  },
  {
    type: "error",
    name: "PositionNotFound",
    inputs: [],
  },
  {
    type: "error",
    name: "ActivationDeadlineExpired",
    inputs: [],
  },
  {
    type: "error",
    name: "CustomErrorWithArgs",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "required", type: "uint256" },
    ],
  },
];

describe("Contract Error Mapping", () => {
  describe("mapViemErrorToContractError", () => {
    it("should handle basic Error objects", () => {
      const error = new Error("Something went wrong");
      const result = mapViemErrorToContractError(error, "test operation");

      expect(result.code).toBe(ErrorCode.CONTRACT_EXECUTION_FAILED);
      expect(result.message).toContain("test operation failed");
    });

    it("should handle unknown error types", () => {
      const result = mapViemErrorToContractError(null, "test operation");

      expect(result.code).toBe(ErrorCode.CONTRACT_EXECUTION_FAILED);
      expect(result.message).toContain("Unknown error");
    });

    it("should detect revert errors from message", () => {
      const error = new Error("execution reverted");
      const result = mapViemErrorToContractError(error, "test operation");

      expect(result.code).toBe(ErrorCode.CONTRACT_REVERT);
    });

    it("should detect gas errors from message", () => {
      const error = new Error("insufficient funds for gas");
      const result = mapViemErrorToContractError(error, "test operation");

      expect(result.code).toBe(ErrorCode.CONTRACT_INSUFFICIENT_GAS);
    });

    it("should detect nonce errors from message", () => {
      const error = new Error("nonce too low");
      const result = mapViemErrorToContractError(error, "test operation");

      expect(result.code).toBe(ErrorCode.CONTRACT_NONCE_ERROR);
    });

    it("should detect user rejection", () => {
      const error = new Error("User rejected the request");
      const result = mapViemErrorToContractError(error, "Deposit");

      expect(result.message).toContain("rejected by the wallet");
    });

    it("should detect paused contract", () => {
      const error = new Error("Contract is paused");
      const result = mapViemErrorToContractError(error, "Withdraw");

      expect(result.message).toContain("paused");
    });

    it("should detect frozen market", () => {
      const error = new Error("Market is frozen");
      const result = mapViemErrorToContractError(error, "Borrow");

      expect(result.message).toContain("frozen");
    });

    it("should detect insufficient liquidity", () => {
      const error = new Error("insufficient liquidity available");
      const result = mapViemErrorToContractError(error, "Borrow");

      expect(result.message).toContain("Insufficient liquidity");
    });

    it("should detect supply cap errors", () => {
      const error = new Error("supply cap exceeded");
      const result = mapViemErrorToContractError(error, "Deposit");

      expect(result.message).toContain("cap");
    });

    it("should extract transaction hash from error object", () => {
      const error = {
        message: "Transaction failed",
        transactionHash:
          "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      };
      const result = mapViemErrorToContractError(error, "test operation");

      expect(result.transactionHash).toBe(
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      );
    });

    it("should extract hash from error object", () => {
      const error = {
        message: "Transaction failed",
        hash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      };
      const result = mapViemErrorToContractError(error, "test operation");

      expect(result.transactionHash).toBe(
        "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      );
    });

    it("should use shortMessage when available", () => {
      const error = {
        message: "Long detailed error message with lots of details",
        shortMessage: "execution reverted",
      };
      const result = mapViemErrorToContractError(error, "test operation");

      // shortMessage triggers revert detection
      expect(result.code).toBe(ErrorCode.CONTRACT_REVERT);
    });
  });

  describe("Custom error decoding", () => {
    // DebtMustBeRepaidFirst() selector: 0x5caf93cd
    const DEBT_MUST_BE_REPAID_ERROR_DATA = "0x5caf93cd";

    // PositionNotFound() selector: 0x6ec9be11
    const POSITION_NOT_FOUND_ERROR_DATA = "0x6ec9be11";

    it("should decode known contract error from data field", () => {
      const error = {
        message: "execution reverted",
        data: DEBT_MUST_BE_REPAID_ERROR_DATA,
      };
      const result = mapViemErrorToContractError(error, "withdraw", [TEST_ABI]);

      expect(result.code).toBe(ErrorCode.CONTRACT_REVERT);
      expect(result.reason).toBe("DebtMustBeRepaidFirst");
      expect(result.message).toContain("repay all debt");
    });

    it("should decode error from nested cause.data", () => {
      const error = {
        message: "execution reverted",
        cause: {
          message: "Execution reverted",
          data: POSITION_NOT_FOUND_ERROR_DATA,
        },
      };
      const result = mapViemErrorToContractError(error, "borrow", [TEST_ABI]);

      expect(result.code).toBe(ErrorCode.CONTRACT_REVERT);
      expect(result.reason).toBe("PositionNotFound");
      expect(result.message).toContain("Position not found");
    });

    it("should decode error from deeply nested cause chain", () => {
      const error = {
        message: "CallExecutionError",
        cause: {
          message: "ExecutionRevertedError",
          cause: {
            message: "RpcRequestError",
            data: DEBT_MUST_BE_REPAID_ERROR_DATA,
          },
        },
      };
      const result = mapViemErrorToContractError(error, "withdraw", [TEST_ABI]);

      expect(result.code).toBe(ErrorCode.CONTRACT_REVERT);
      expect(result.reason).toBe("DebtMustBeRepaidFirst");
    });

    it("should decode error from revertData field", () => {
      const error = {
        message: "execution reverted",
        revertData: DEBT_MUST_BE_REPAID_ERROR_DATA,
      };
      const result = mapViemErrorToContractError(error, "test", [TEST_ABI]);

      expect(result.reason).toBe("DebtMustBeRepaidFirst");
    });

    it("should decode error from RPC error structure", () => {
      const error = {
        message: "RPC Error",
        error: {
          data: DEBT_MUST_BE_REPAID_ERROR_DATA,
        },
      };
      const result = mapViemErrorToContractError(error, "test", [TEST_ABI]);

      expect(result.reason).toBe("DebtMustBeRepaidFirst");
    });

    it("should decode ERC20InsufficientBalance from common ABI", () => {
      // ERC20InsufficientBalance(address,uint256,uint256) selector: 0xe450d38c
      // Properly ABI-encoded error data
      const errorData =
        "0xe450d38c" + // selector
        "0000000000000000000000001234567890123456789012345678901234567890" + // sender (address, 32 bytes)
        "0000000000000000000000000000000000000000000000000000000000000064" + // balance: 100 (uint256)
        "00000000000000000000000000000000000000000000000000000000000000c8"; // needed: 200 (uint256)

      const error = {
        message: "execution reverted",
        data: errorData as `0x${string}`,
      };
      // Don't pass any ABI - should use COMMON_ERROR_ABI as fallback
      const result = mapViemErrorToContractError(error, "repay", []);

      expect(result.code).toBe(ErrorCode.CONTRACT_REVERT);
      expect(result.reason).toBe("ERC20InsufficientBalance");
      expect(result.message).toContain("Insufficient token balance");
    });

    it("should handle unknown error selectors gracefully", () => {
      const error = {
        message: "execution reverted",
        data: "0xdeadbeef", // Unknown selector
      };
      const result = mapViemErrorToContractError(error, "test", [TEST_ABI]);

      // Should still detect revert from message
      expect(result.code).toBe(ErrorCode.CONTRACT_REVERT);
      // But won't have decoded reason
      expect(result.reason).not.toBe("DebtMustBeRepaidFirst");
    });

    it("should ignore too-short error data", () => {
      const error = {
        message: "execution reverted",
        data: "0x1234", // Too short (less than 4 bytes)
      };
      const result = mapViemErrorToContractError(error, "test", [TEST_ABI]);

      expect(result.code).toBe(ErrorCode.CONTRACT_REVERT);
    });

    it("decodes a viem ContractFunctionRevertedError that exposes raw hex in `.raw` only", () => {
      // viem 2.38.x stores the DECODED result in `.data` ({ errorName, args })
      // and the RAW revert hex in `.raw`. The mapper must read `.raw` to
      // re-decode — this is the real shape `simulateContract` throws, and why
      // the activation revert previously fell through to the raw viem dump.
      const error = {
        message:
          'The contract function "activateVaultWithSecret" reverted. Error: ActivationDeadlineExpired()',
        cause: {
          name: "ContractFunctionRevertedError",
          message: "reverted. Error: ActivationDeadlineExpired()",
          // Decoded object — NOT a hex string, so the old `.data` check skips it.
          data: { errorName: "ActivationDeadlineExpired", args: [] },
          // Raw revert bytes live here.
          raw: encodeErrorResult({
            abi: TEST_ABI,
            errorName: "ActivationDeadlineExpired",
          }),
        },
      };
      const result = mapViemErrorToContractError(error, "vault activation", [
        TEST_ABI,
      ]);

      expect(result.code).toBe(ErrorCode.CONTRACT_REVERT);
      expect(result.reason).toBe("ActivationDeadlineExpired");
      expect(result.message).toBe(
        "The activation deadline has passed. The BTC Vault can no longer be activated.",
      );
    });

    it("uses viem's pre-decoded .data.errorName when no ABI is supplied", () => {
      // Borrow/repay/withdraw/reorder call the mapper with NO ABI, so a custom
      // error's selector isn't in COMMON_ERROR_ABI and `.raw` can't be
      // re-decoded. But viem already decoded the name into `.data.errorName`
      // using the call's own ABI — read that directly.
      const error = {
        message: "execution reverted",
        cause: {
          name: "ContractFunctionRevertedError",
          data: { errorName: "DebtMustBeRepaidFirst", args: [] },
          raw: "0x5caf93cd",
        },
      };
      const result = mapViemErrorToContractError(error, "withdraw"); // no ABI

      expect(result.code).toBe(ErrorCode.CONTRACT_REVERT);
      expect(result.reason).toBe("DebtMustBeRepaidFirst");
      expect(result.message).toBe(
        "You must repay all debt before withdrawing collateral.",
      );
    });

    it("does not treat a built-in revert(string)/Error as a custom error — surfaces the reason", () => {
      // viem decodes a Solidity `revert("...")` to errorName "Error" with the
      // reason in args/message. We must NOT return "Error" as the final
      // message; the message-based handling should surface the reason
      // (here, the paused-market copy).
      const reverted = {
        name: "ContractFunctionRevertedError",
        data: { errorName: "Error", args: ["Contract is paused"] },
        raw: encodeErrorResult({
          abi: [{ type: "error", name: "Error", inputs: [{ type: "string" }] }],
          errorName: "Error",
          args: ["Contract is paused"],
        }),
      };
      const error = Object.assign(
        new Error("execution reverted: Contract is paused"),
        { cause: reverted },
      );

      const result = mapViemErrorToContractError(error, "Withdraw", [TEST_ABI]);

      expect(result.reason).not.toBe("Error");
      expect(result.message).toContain("paused");
    });

    it("should ignore empty error data", () => {
      const error = {
        message: "execution reverted",
        data: "0x",
      };
      const result = mapViemErrorToContractError(error, "test", [TEST_ABI]);

      expect(result.code).toBe(ErrorCode.CONTRACT_REVERT);
    });

    it("decodes an Aave adapter VaultCountExceedsMaximum revert (0xb29ce077) to the per-position cap message when the adapter ABI is supplied", () => {
      // Activation delegates into the Aave adapter, which reverts with this
      // error — absent from the registry ABI viem decoded against, so
      // simulateContract throws with the raw hex in `.raw` only. The mapper
      // re-decodes it against the adapter ABI threaded in via errorAbis.
      const error = {
        message:
          'The contract function "activateVaultWithSecret" reverted with the following signature: 0xb29ce077',
        cause: {
          name: "ContractFunctionRevertedError",
          raw: encodeErrorResult({
            abi: AaveIntegrationAdapterABI as Abi,
            errorName: "VaultCountExceedsMaximum",
            args: [11n, 10n],
          }),
        },
      };
      const result = mapViemErrorToContractError(error, "vault activation", [
        AaveIntegrationAdapterABI as Abi,
      ]);

      expect(result.code).toBe(ErrorCode.CONTRACT_REVERT);
      expect(result.reason).toBe("VaultCountExceedsMaximum");
      expect(result.message).toBe(
        "You have reached the maximum number of BTC Vaults per position.",
      );
    });

    it("decodes an Aave adapter PositionAboveMaximum revert to the max-position-size message when the adapter ABI is supplied", () => {
      const error = {
        message: "execution reverted",
        cause: {
          name: "ContractFunctionRevertedError",
          raw: encodeErrorResult({
            abi: AaveIntegrationAdapterABI as Abi,
            errorName: "PositionAboveMaximum",
            args: [101n, 100n],
          }),
        },
      };
      const result = mapViemErrorToContractError(error, "vault activation", [
        AaveIntegrationAdapterABI as Abi,
      ]);

      expect(result.reason).toBe("PositionAboveMaximum");
      expect(result.message).toBe(
        "Your total BTC Vault amount exceeds the maximum position size.",
      );
    });

    it("does NOT resolve VaultCountExceedsMaximum without the adapter ABI — the registry ABI alone leaves it as raw hex (the bug)", () => {
      const error = {
        message:
          'The contract function "activateVaultWithSecret" reverted with the following signature: 0xb29ce077',
        cause: {
          name: "ContractFunctionRevertedError",
          raw: encodeErrorResult({
            abi: AaveIntegrationAdapterABI as Abi,
            errorName: "VaultCountExceedsMaximum",
            args: [11n, 10n],
          }),
        },
      };
      // TEST_ABI stands in for the registry ABI — it lacks the adapter errors.
      const result = mapViemErrorToContractError(error, "vault activation", [
        TEST_ABI,
      ]);

      expect(result.reason).not.toBe("VaultCountExceedsMaximum");
      expect(result.message).not.toBe(
        "You have reached the maximum number of BTC Vaults per position.",
      );
    });
  });

  describe("Error message formatting", () => {
    it("should use friendly message for known errors", () => {
      const error = {
        message: "execution reverted",
        data: "0x5caf93cd", // DebtMustBeRepaidFirst - known error
      };
      const result = mapViemErrorToContractError(error, "test", [TEST_ABI]);

      // Known error should use friendly message from CONTRACT_ERROR_MESSAGES
      expect(result.message).toBe(
        "You must repay all debt before withdrawing collateral.",
      );
    });

    it("should preserve original error as cause", () => {
      const originalError = new Error("Original error");
      const result = mapViemErrorToContractError(
        originalError,
        "test operation",
      );

      expect(result.cause).toBe(originalError);
    });
  });
});
