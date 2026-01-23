/**
 * Contract error mapping utilities.
 *
 * Converts viem contract errors into user-friendly ContractError instances.
 * Supports decoding custom contract errors using ABIs.
 */

import { type Abi, type Hash, decodeErrorResult } from "viem";

import { COMMON_ERROR_ABI } from "./commonErrorAbi";
import { CONTRACT_ERROR_MESSAGES } from "./errorMessages";
import { ContractError, ErrorCode } from "./types";

/**
 * Recursively search for error data in a nested error object.
 *
 * Viem wraps errors multiple levels deep (CallExecutionError -> ExecutionRevertedError
 * -> RpcRequestError), and the revert data could be at any level.
 *
 * Note: Some RPC providers don't return revert data. Use Alchemy, Infura,
 * or another provider that supports returning revert reasons.
 */
function findErrorData(obj: unknown, depth = 0): `0x${string}` | undefined {
  if (depth > 10 || !obj || typeof obj !== "object") {
    return undefined;
  }

  const errorObj = obj as Record<string, unknown>;

  // Check for data field (hex string starting with 0x, at least 10 chars for 4-byte selector)
  if (
    errorObj.data &&
    typeof errorObj.data === "string" &&
    errorObj.data.startsWith("0x") &&
    errorObj.data.length >= 10
  ) {
    return errorObj.data as `0x${string}`;
  }

  // Check for revertData (some viem versions)
  if (
    errorObj.revertData &&
    typeof errorObj.revertData === "string" &&
    errorObj.revertData.startsWith("0x") &&
    errorObj.revertData.length >= 10
  ) {
    return errorObj.revertData as `0x${string}`;
  }

  // Check for RPC error structure (error.data from JSON-RPC response)
  if (errorObj.error && typeof errorObj.error === "object") {
    const rpcData = (errorObj.error as Record<string, unknown>)
      .data as `0x${string}`;
    if (rpcData && rpcData.startsWith("0x") && rpcData.length >= 10) {
      return rpcData;
    }
  }

  // Recursively check cause chain
  if (errorObj.cause) {
    const causeData = findErrorData(errorObj.cause, depth + 1);
    if (causeData) return causeData;
  }

  // Check walk function (viem's error traversal)
  if (typeof errorObj.walk === "function") {
    try {
      let foundData: `0x${string}` | undefined;
      (errorObj.walk as (fn: (e: unknown) => boolean) => unknown)((e) => {
        const data = findErrorData(e, depth + 1);
        if (data) {
          foundData = data;
          return true;
        }
        return false;
      });
      if (foundData) return foundData;
    } catch {
      // walk function failed, continue
    }
  }

  return undefined;
}

/**
 * Try to decode a custom contract error from the error data.
 */
function tryDecodeContractError(
  error: unknown,
  abis: Abi[],
): { errorName: string; args?: readonly unknown[] } | undefined {
  const errorData = findErrorData(error);

  if (!errorData || errorData === "0x" || errorData.length < 10) {
    return undefined;
  }

  // Try provided ABIs + common errors as fallback
  const allAbis = [...abis, COMMON_ERROR_ABI];

  for (const abi of allAbis) {
    try {
      return decodeErrorResult({ abi, data: errorData });
    } catch {
      continue;
    }
  }

  return undefined;
}

/**
 * Get user-friendly message for a decoded contract error.
 */
function getDecodedErrorMessage(errorName: string): string {
  const friendlyMessage = CONTRACT_ERROR_MESSAGES[errorName];
  if (friendlyMessage) {
    return friendlyMessage;
  }
  // Fallback: convert camelCase to readable format
  return errorName.replace(/([A-Z])/g, " $1").trim();
}

/**
 * Get enhanced error message based on pattern matching.
 */
function getEnhancedErrorMessage(
  message: string,
  operationName: string,
): string {
  const lowerMessage = message.toLowerCase();

  if (
    lowerMessage.includes("paused") ||
    lowerMessage.includes("whennotpaused")
  ) {
    return `${operationName} failed: The market is currently paused. Please try again later.`;
  }
  if (lowerMessage.includes("frozen") || lowerMessage.includes("isfrozen")) {
    return `${operationName} failed: This market is frozen and not accepting operations.`;
  }
  if (
    lowerMessage.includes("insufficient liquidity") ||
    lowerMessage.includes("not enough")
  ) {
    return `${operationName} failed: Insufficient liquidity. Please try a smaller amount.`;
  }
  if (lowerMessage.includes("cap") || lowerMessage.includes("supply cap")) {
    return `${operationName} failed: The collateral cap has been reached.`;
  }
  if (
    lowerMessage.includes("user rejected") ||
    lowerMessage.includes("denied")
  ) {
    return `${operationName} was rejected by the wallet.`;
  }

  return `${operationName} failed: ${message}`;
}

/**
 * Maps viem contract errors to ContractError with appropriate error codes.
 *
 * @param error - The error caught from viem contract operations
 * @param operationName - Name of the operation (for error context)
 * @param abis - Optional ABIs to decode custom contract errors
 * @returns ContractError with user-friendly message
 */
export function mapViemErrorToContractError(
  error: unknown,
  operationName: string,
  abis?: Abi[],
): ContractError {
  const errorMessage = error instanceof Error ? error.message : "Unknown error";
  const errorName = error instanceof Error ? error.name : "UnknownError";
  let code: ErrorCode = ErrorCode.CONTRACT_EXECUTION_FAILED;
  let reason: string | undefined;
  let transactionHash: string | undefined;
  let enhancedMessage: string | undefined;

  // Try to decode custom contract error first
  // Always attempt decoding - COMMON_ERROR_ABI is used as fallback even when no ABIs provided
  const decoded = tryDecodeContractError(error, abis ?? []);
  if (decoded) {
    code = ErrorCode.CONTRACT_REVERT;
    reason = decoded.errorName;
    enhancedMessage = getDecodedErrorMessage(decoded.errorName);
  }

  // Extract additional info from error object
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
        reason = reason || message;
      } else if (
        message.includes("gas") ||
        message.includes("insufficient funds for gas") ||
        message.includes("out of gas")
      ) {
        code = ErrorCode.CONTRACT_INSUFFICIENT_GAS;
        reason = reason || message;
      } else if (
        message.includes("nonce") ||
        message.includes("replacement transaction underpriced") ||
        message.includes("already known")
      ) {
        code = ErrorCode.CONTRACT_NONCE_ERROR;
        reason = reason || message;
      } else if (
        message.includes("execution failed") ||
        message.includes("simulation failed") ||
        message.includes("call exception")
      ) {
        code = ErrorCode.CONTRACT_EXECUTION_FAILED;
        reason = reason || message;
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

  const finalMessage =
    enhancedMessage || getEnhancedErrorMessage(errorMessage, operationName);

  return new ContractError(finalMessage, code, transactionHash, reason, {
    cause: error,
  });
}
