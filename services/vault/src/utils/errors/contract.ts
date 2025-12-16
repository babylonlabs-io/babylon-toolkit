import { type Hash } from "viem";

import { ContractError, ErrorCode } from "./types";

function getEnhancedErrorMessage(
  message: string,
  operationName: string,
): string {
  const lowerMessage = message.toLowerCase();

  if (
    lowerMessage.includes("paused") ||
    lowerMessage.includes("whennotpaused")
  ) {
    return `${operationName} failed: The market is currently paused for maintenance. Please try again later.`;
  }
  if (lowerMessage.includes("frozen") || lowerMessage.includes("isfrozen")) {
    return `${operationName} failed: This market is frozen and not accepting new operations.`;
  }
  if (
    lowerMessage.includes("insufficient liquidity") ||
    lowerMessage.includes("not enough")
  ) {
    return `${operationName} failed: Insufficient liquidity available in the market. Please try a smaller amount.`;
  }
  if (lowerMessage.includes("cap") || lowerMessage.includes("supply cap")) {
    return `${operationName} failed: The collateral cap has been reached. Please try a smaller amount.`;
  }
  if (
    lowerMessage.includes("user rejected") ||
    lowerMessage.includes("denied")
  ) {
    return `${operationName} was rejected by the wallet.`;
  }
  return `Failed to ${operationName}: ${message}`;
}

/**
 * Maps viem contract errors to ContractError with appropriate error codes
 *
 * @param error - The error caught from viem contract operations
 * @param operationName - Name of the contract operation that failed (for better error messages)
 * @returns ContractError with appropriate error code
 */
export function mapViemErrorToContractError(
  error: unknown,
  operationName: string,
): ContractError {
  const errorMessage = error instanceof Error ? error.message : "Unknown error";
  const errorName = error instanceof Error ? error.name : "UnknownError";
  let code: ErrorCode = ErrorCode.CONTRACT_EXECUTION_FAILED;
  let reason: string | undefined;
  let transactionHash: string | undefined;

  if (error && typeof error === "object") {
    const errorObj = error as Record<string, unknown>;

    if ("shortMessage" in errorObj || "message" in errorObj) {
      const message =
        (errorObj.shortMessage as string) ||
        (errorObj.message as string) ||
        errorMessage;

      if (
        errorName === "ContractFunctionRevertedError" ||
        message.includes("revert") ||
        message.includes("execution reverted")
      ) {
        code = ErrorCode.CONTRACT_REVERT;
        reason = message;
      } else if (
        message.includes("gas") ||
        message.includes("insufficient funds for gas") ||
        message.includes("out of gas")
      ) {
        code = ErrorCode.CONTRACT_INSUFFICIENT_GAS;
        reason = message;
      } else if (
        message.includes("nonce") ||
        message.includes("replacement transaction underpriced") ||
        message.includes("already known")
      ) {
        code = ErrorCode.CONTRACT_NONCE_ERROR;
        reason = message;
      } else if (
        message.includes("execution failed") ||
        message.includes("simulation failed") ||
        message.includes("call exception")
      ) {
        code = ErrorCode.CONTRACT_EXECUTION_FAILED;
        reason = message;
      }

      if ("cause" in errorObj && errorObj.cause) {
        reason =
          reason ||
          (errorObj.cause instanceof Error
            ? errorObj.cause.message
            : String(errorObj.cause));
      }
    }

    if ("transactionHash" in errorObj && errorObj.transactionHash) {
      transactionHash = errorObj.transactionHash as string;
    }

    if ("hash" in errorObj && errorObj.hash) {
      transactionHash = (errorObj.hash as Hash) || transactionHash;
    }
  }

  const enhancedMessage = getEnhancedErrorMessage(errorMessage, operationName);

  return new ContractError(enhancedMessage, code, transactionHash, reason, {
    cause: error,
  });
}
