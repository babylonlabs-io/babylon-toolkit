/**
 * Tests for contract error mapping utilities
 */

import {
  type Abi,
  encodeErrorResult,
  NonceTooLowError,
  RpcRequestError,
} from "viem";
import { describe, expect, it } from "vitest";

import { COPY } from "@/copy";

import {
  ACTIVATION_DEADLINE_EXPIRED_REASON,
  getContractErrorArgs,
  isActivationDeadlineExpiredError,
  isTerminalActivationError,
  mapViemErrorToContractError,
} from "../contract";
import { ActivationNotPossibleError, ContractError, ErrorCode } from "../types";

// Test ABI with custom errors
const TEST_ABI: Abi = [
  {
    type: "error",
    name: "InvalidVaultsArray",
    inputs: [],
  },
  {
    type: "error",
    name: "PositionNotHealthy",
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

    it("maps an insufficient-ETH-for-gas send failure to friendly copy, not the raw node dump", () => {
      const error = new Error(
        "borrow from Aave Core position failed: The total cost (gas * gas fee + value) of executing this transaction exceeds the balance of the account. insufficient funds for gas * price + value: balance 451223622186226",
      );
      const result = mapViemErrorToContractError(error, "Borrow");

      expect(result.code).toBe(ErrorCode.CONTRACT_INSUFFICIENT_GAS);
      expect(result.message).toBe(
        COPY.common.classifiedErrors.insufficientFunds,
      );
    });

    it("matches the insufficient-funds message case-insensitively", () => {
      const error = new Error("Insufficient Funds for gas * price + value");
      const result = mapViemErrorToContractError(error, "Borrow");

      expect(result.code).toBe(ErrorCode.CONTRACT_INSUFFICIENT_GAS);
      expect(result.message).toBe(
        COPY.common.classifiedErrors.insufficientFunds,
      );
    });

    it("should detect nonce errors from message", () => {
      const error = new Error("nonce too low");
      const result = mapViemErrorToContractError(error, "test operation");

      expect(result.code).toBe(ErrorCode.CONTRACT_NONCE_ERROR);
    });

    it("maps a stale-nonce send rejection to friendly copy, not the raw node text", () => {
      const error = new NonceTooLowError({
        cause: new RpcRequestError({
          body: {},
          error: {
            code: -32000,
            message: "nonce too low: next nonce 788, tx nonce 787",
          },
          url: "https://rpc.example",
        }),
      });
      const result = mapViemErrorToContractError(error, "approve ERC20");

      expect(result.code).toBe(ErrorCode.CONTRACT_NONCE_ERROR);
      expect(result.message).toBe(COPY.common.classifiedErrors.staleNonce);
    });

    it("keeps the stale-nonce copy when an already-mapped error is mapped again", () => {
      const first = mapViemErrorToContractError(
        new Error(
          "Nonce provided for the transaction is lower than the current nonce of the account.",
        ),
        "repay to Aave Core position",
      );
      const result = mapViemErrorToContractError(first, "Repay");

      expect(result.code).toBe(ErrorCode.CONTRACT_NONCE_ERROR);
      expect(result.message).toBe(COPY.common.classifiedErrors.staleNonce);
    });

    it("does not show the stale-nonce copy when the node already holds the transaction", () => {
      const error = new NonceTooLowError({
        cause: new RpcRequestError({
          body: {},
          error: { code: -32000, message: "already known" },
          url: "https://rpc.example",
        }),
      });
      const result = mapViemErrorToContractError(error, "Repay");

      expect(result.code).toBe(ErrorCode.CONTRACT_NONCE_ERROR);
      expect(result.message).not.toBe(COPY.common.classifiedErrors.staleNonce);
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
    const INVALID_VAULTS_ARRAY_ERROR_DATA = encodeErrorResult({
      abi: TEST_ABI,
      errorName: "InvalidVaultsArray",
    });
    const POSITION_NOT_HEALTHY_ERROR_DATA = encodeErrorResult({
      abi: TEST_ABI,
      errorName: "PositionNotHealthy",
    });

    it("should decode known contract error from data field", () => {
      const error = {
        message: "execution reverted",
        data: INVALID_VAULTS_ARRAY_ERROR_DATA,
      };
      const result = mapViemErrorToContractError(error, "withdraw", [TEST_ABI]);

      expect(result.code).toBe(ErrorCode.CONTRACT_REVERT);
      expect(result.reason).toBe("InvalidVaultsArray");
      expect(result.message).toContain("doesn't match your current position");
    });

    it("keeps a decoded error's arguments for callers that scale them", () => {
      const error = {
        message: "execution reverted",
        data: encodeErrorResult({
          abi: TEST_ABI,
          errorName: "CustomErrorWithArgs",
          args: [1_000_000n, 2_000_000n],
        }),
      };
      const result = mapViemErrorToContractError(error, "borrow", [TEST_ABI]);

      expect(result.reason).toBe("CustomErrorWithArgs");
      expect(getContractErrorArgs(result)).toEqual([1_000_000n, 2_000_000n]);
    });

    it("keeps the arguments viem already decoded on the error chain", () => {
      const error = {
        message: "execution reverted",
        data: { errorName: "DrawCapExceeded", args: [1_000n] },
      };
      const result = mapViemErrorToContractError(error, "borrow");

      expect(result.reason).toBe("DrawCapExceeded");
      expect(getContractErrorArgs(result)).toEqual([1_000n]);
    });

    it("keeps a decoded revert even when its wrapper message says 'insufficient funds'", () => {
      // A real contract revert whose wrapper text happens to contain
      // "insufficient funds" must not be relabeled as an ETH-gas shortfall.
      const error = {
        message: "insufficient funds",
        data: INVALID_VAULTS_ARRAY_ERROR_DATA,
      };
      const result = mapViemErrorToContractError(error, "withdraw", [TEST_ABI]);

      expect(result.code).toBe(ErrorCode.CONTRACT_REVERT);
      expect(result.reason).toBe("InvalidVaultsArray");
      expect(result.message).not.toBe(
        COPY.common.classifiedErrors.insufficientFunds,
      );
    });

    it("should decode error from nested cause.data", () => {
      const error = {
        message: "execution reverted",
        cause: {
          message: "Execution reverted",
          data: POSITION_NOT_HEALTHY_ERROR_DATA,
        },
      };
      const result = mapViemErrorToContractError(error, "borrow", [TEST_ABI]);

      expect(result.code).toBe(ErrorCode.CONTRACT_REVERT);
      expect(result.reason).toBe("PositionNotHealthy");
      expect(result.message).toContain("at risk of liquidation");
    });

    it("should decode error from deeply nested cause chain", () => {
      const error = {
        message: "CallExecutionError",
        cause: {
          message: "ExecutionRevertedError",
          cause: {
            message: "RpcRequestError",
            data: INVALID_VAULTS_ARRAY_ERROR_DATA,
          },
        },
      };
      const result = mapViemErrorToContractError(error, "withdraw", [TEST_ABI]);

      expect(result.code).toBe(ErrorCode.CONTRACT_REVERT);
      expect(result.reason).toBe("InvalidVaultsArray");
    });

    it("should decode error from revertData field", () => {
      const error = {
        message: "execution reverted",
        revertData: INVALID_VAULTS_ARRAY_ERROR_DATA,
      };
      const result = mapViemErrorToContractError(error, "test", [TEST_ABI]);

      expect(result.reason).toBe("InvalidVaultsArray");
    });

    it("should decode error from RPC error structure", () => {
      const error = {
        message: "RPC Error",
        error: {
          data: INVALID_VAULTS_ARRAY_ERROR_DATA,
        },
      };
      const result = mapViemErrorToContractError(error, "test", [TEST_ABI]);

      expect(result.reason).toBe("InvalidVaultsArray");
    });

    it("decodes ERC20InsufficientBalance through the vault error fallback", () => {
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
      // Don't pass any ABI - should use VAULT_ERROR_ABI as fallback
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
      expect(result.reason).not.toBe("InvalidVaultsArray");
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
        "The activation deadline has passed. The BTCVault can no longer be activated.",
      );
    });

    it("uses viem's pre-decoded .data.errorName when no ABI is supplied", () => {
      // viem already decoded the name into `.data.errorName` using the call's
      // own ABI; that is read first, even when `.raw` would not re-decode.
      const error = {
        message: "execution reverted",
        cause: {
          name: "ContractFunctionRevertedError",
          data: { errorName: "InvalidVaultsArray", args: [] },
          raw: "0xdeadbeef",
        },
      };
      const result = mapViemErrorToContractError(error, "withdraw"); // no ABI

      expect(result.code).toBe(ErrorCode.CONTRACT_REVERT);
      expect(result.reason).toBe("InvalidVaultsArray");
      expect(result.message).toBe(
        "The BTCVault list doesn't match your current position. Refresh the page and try again.",
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

    it("decodes a revert the call's own ABI lacks through the vault error fallback", () => {
      // TEST_ABI stands in for the registry ABI, which does not declare the
      // pause error; the fallback covers every vault contract error.
      const error = {
        message: "execution reverted",
        cause: {
          name: "ContractFunctionRevertedError",
          raw: encodeErrorResult({
            abi: [{ type: "error", name: "TBV_Paused", inputs: [] }],
            errorName: "TBV_Paused",
          }),
        },
      };
      const result = mapViemErrorToContractError(
        error,
        "vault activate-and-redeem",
        [TEST_ABI],
      );

      expect(result.code).toBe(ErrorCode.CONTRACT_REVERT);
      expect(result.reason).toBe("TBV_Paused");
      expect(result.message).toBe(
        "The system is currently paused. Please try again later.",
      );
    });

    it("returns an already-mapped ContractError unchanged", () => {
      const mapped = mapViemErrorToContractError(
        {
          message: "execution reverted",
          data: encodeErrorResult({
            abi: TEST_ABI,
            errorName: "CustomErrorWithArgs",
            args: [1n, 2n],
          }),
        },
        "Reorder Vaults",
        [TEST_ABI],
      );

      const remapped = mapViemErrorToContractError(mapped, "Reorder Vaults");

      expect(remapped).toBe(mapped);
      expect(remapped.reason).toBe("CustomErrorWithArgs");
      expect(getContractErrorArgs(remapped)).toEqual([1n, 2n]);
    });
  });

  describe("Error message formatting", () => {
    it("should use friendly message for known errors", () => {
      const error = {
        message: "execution reverted",
        data: encodeErrorResult({
          abi: TEST_ABI,
          errorName: "InvalidVaultsArray",
        }),
      };
      const result = mapViemErrorToContractError(error, "test", [TEST_ABI]);

      // Known error should use friendly message from CONTRACT_ERROR_MESSAGES
      expect(result.message).toBe(
        "The BTCVault list doesn't match your current position. Refresh the page and try again.",
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

  describe("isActivationDeadlineExpiredError", () => {
    it("returns true for the decoded ActivationDeadlineExpired revert", () => {
      const data = encodeErrorResult({
        abi: TEST_ABI,
        errorName: "ActivationDeadlineExpired",
      });
      const mapped = mapViemErrorToContractError(
        { message: "execution reverted", data },
        "activate",
        [TEST_ABI],
      );

      expect(mapped.reason).toBe(ACTIVATION_DEADLINE_EXPIRED_REASON);
      expect(isActivationDeadlineExpiredError(mapped)).toBe(true);
    });

    it("returns false for a different contract revert", () => {
      const data = encodeErrorResult({
        abi: TEST_ABI,
        errorName: "PositionNotHealthy",
      });
      const mapped = mapViemErrorToContractError(
        { message: "execution reverted", data },
        "activate",
        [TEST_ABI],
      );

      expect(isActivationDeadlineExpiredError(mapped)).toBe(false);
    });

    it("returns false for a ContractError without the deadline reason", () => {
      const err = new ContractError(
        "nope",
        ErrorCode.CONTRACT_REVERT,
        undefined,
        "SomethingElse",
      );

      expect(isActivationDeadlineExpiredError(err)).toBe(false);
    });

    it("returns false for a plain Error, the message string, or null", () => {
      expect(isActivationDeadlineExpiredError(new Error("boom"))).toBe(false);
      expect(
        isActivationDeadlineExpiredError(
          "The activation deadline has passed. The BTCVault can no longer be activated.",
        ),
      ).toBe(false);
      expect(isActivationDeadlineExpiredError(null)).toBe(false);
    });
  });

  describe("isTerminalActivationError", () => {
    it("returns true for the deadline-expired contract revert", () => {
      const data = encodeErrorResult({
        abi: TEST_ABI,
        errorName: "ActivationDeadlineExpired",
      });
      const mapped = mapViemErrorToContractError(
        { message: "execution reverted", data },
        "activate",
        [TEST_ABI],
      );

      expect(isTerminalActivationError(mapped)).toBe(true);
    });

    it("returns true for an ActivationNotPossibleError (e.g. already EXPIRED)", () => {
      const err = new ActivationNotPossibleError(
        "Cannot activate: BTCVault is in EXPIRED state.",
      );

      expect(isTerminalActivationError(err)).toBe(true);
    });

    it("returns false for a retryable plain Error and null", () => {
      expect(
        isTerminalActivationError(new Error("Cannot activate: ... PENDING")),
      ).toBe(false);
      expect(isTerminalActivationError(null)).toBe(false);
    });
  });

  describe("repay approval copy survives message rewriting", () => {
    // getEnhancedErrorMessage substring-rewrites messages containing e.g.
    // "not enough" / "insufficient liquidity" / "paused"; the approval copy
    // is worded to dodge those rules — pin that property here.
    it("preserves the approval-not-confirmed copy under the Repay mapping", () => {
      const body = COPY.loans.repay.approvalNotConfirmed(
        "3 USDC",
        "0.000002 USDC",
      );
      const mapped = mapViemErrorToContractError(new Error(body), "Repay");
      expect(mapped.message).toBe(`Repay failed: ${body}`);
    });

    it("preserves the approval-below-required copy under the Repay mapping", () => {
      const body = COPY.loans.repay.approvalBelowRequired("3 USDC", "2 USDC");
      const mapped = mapViemErrorToContractError(new Error(body), "Repay");
      expect(mapped.message).toBe(`Repay failed: ${body}`);
    });

    it("preserves the balance-below-full-repay copy under the Repay mapping", () => {
      const body = COPY.loans.repay.balanceBelowFullRepay("3 USDC", "2 USDC");
      const mapped = mapViemErrorToContractError(new Error(body), "Repay");
      expect(mapped.message).toBe(`Repay failed: ${body}`);
    });

    it("preserves the balance-below-repay-amount copy under the Repay mapping", () => {
      const body = COPY.loans.repay.balanceBelowRepayAmount("3 USDC", "2 USDC");
      const mapped = mapViemErrorToContractError(new Error(body), "Repay");
      expect(mapped.message).toBe(`Repay failed: ${body}`);
    });
  });
});
