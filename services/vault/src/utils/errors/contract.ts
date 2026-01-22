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
  console.group("🔍 [Error Mapping]");

  const errorMessage = error instanceof Error ? error.message : "Unknown error";
  const errorName = error instanceof Error ? error.name : "UnknownError";
  let code: ErrorCode = ErrorCode.CONTRACT_EXECUTION_FAILED;
  let reason: string | undefined;
  let transactionHash: string | undefined;

  console.log("Original error message:", errorMessage);
  console.log("Error name:", errorName);

  if (error && typeof error === "object") {
    const errorObj = error as Record<string, unknown>;

    console.log("Error object keys:", Object.keys(errorObj));

    // Extract all possible error messages for analysis
    if ("shortMessage" in errorObj) {
      console.log("shortMessage:", errorObj.shortMessage);
    }
    if ("details" in errorObj) {
      console.log("details:", errorObj.details);
    }
    if ("metaMessages" in errorObj) {
      console.log("metaMessages:", errorObj.metaMessages);
    }
    if ("data" in errorObj) {
      console.log("data:", errorObj.data);
    }

    if ("shortMessage" in errorObj || "message" in errorObj) {
      const message =
        (errorObj.shortMessage as string) ||
        (errorObj.message as string) ||
        errorMessage;

      console.log("Using message for classification:", message);

      if (
        errorName === "ContractFunctionRevertedError" ||
        message.includes("revert") ||
        message.includes("execution reverted")
      ) {
        code = ErrorCode.CONTRACT_REVERT;
        reason = message;

        // Try to extract the actual revert reason from the error
        if ("cause" in errorObj && errorObj.cause) {
          const cause = errorObj.cause as any;
          if (cause.reason) {
            console.log("Found revert reason:", cause.reason);
            reason = cause.reason;
          }
          if (cause.data) {
            console.log("Found revert data:", cause.data);
          }
        }
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
        const causeReason =
          errorObj.cause instanceof Error
            ? errorObj.cause.message
            : String(errorObj.cause);
        console.log("Cause reason:", causeReason);
        reason = reason || causeReason;
      }
    }

    if ("transactionHash" in errorObj && errorObj.transactionHash) {
      transactionHash = errorObj.transactionHash as string;
    }

    if ("hash" in errorObj && errorObj.hash) {
      transactionHash = (errorObj.hash as Hash) || transactionHash;
    }
  }

  console.log("Final reason:", reason);
  console.log("Error code:", code);

  const enhancedMessage = getEnhancedErrorMessage(
    reason || errorMessage,
    operationName,
  );
  console.log("Enhanced message:", enhancedMessage);
  console.groupEnd();

  return new ContractError(enhancedMessage, code, transactionHash, reason, {
    cause: error,
  });
}
