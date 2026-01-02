/**
 * Contract Error Handling Utilities
 *
 * Provides utilities for extracting and handling contract revert errors.
 * Maps known error selectors to user-friendly messages.
 *
 * @module contracts/errors
 */

/**
 * Known contract error signatures mapped to user-friendly messages.
 *
 * Error selectors are the first 4 bytes of keccak256(error signature).
 * Example: keccak256("VaultAlreadyExists()") = 0x04aabf33...
 */
export const CONTRACT_ERRORS: Record<string, string> = {
  // VaultAlreadyExists()
  "0x04aabf33":
    "Vault already exists: This Bitcoin transaction has already been registered. " +
    "Please select different UTXOs or use a different amount to create a unique transaction.",
  // Unauthorized()
  "0x82b42900":
    "Unauthorized: You must be the depositor or vault provider to submit this transaction.",
  // InvalidSignature() - common signature verification error
  "0x8baa579f":
    "Invalid signature: The BTC proof of possession signature could not be verified.",
  // InvalidBtcTransaction()
  "0x2f9d01e9":
    "Invalid BTC transaction: The Bitcoin transaction format is invalid.",
  // VaultProviderNotRegistered()
  "0x5a3c6b3e":
    "Vault provider not registered: The selected vault provider is not registered.",
};

/**
 * Extract error data from various error formats.
 *
 * Viem and wallet providers wrap errors in multiple levels. This function
 * searches through the error chain to find the revert data.
 *
 * @param error - The error object to extract data from
 * @returns The error data (e.g., "0x04aabf33") or undefined
 */
export function extractErrorData(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;

  const err = error as Record<string, unknown>;

  // Check direct properties first
  if (typeof err.data === "string" && err.data.startsWith("0x")) {
    return err.data;
  }
  if (typeof err.details === "string" && err.details.startsWith("0x")) {
    return err.details;
  }

  // Walk the cause chain (viem wraps errors multiple levels deep)
  let current: unknown = err.cause;
  let depth = 0;
  const maxDepth = 5;

  while (current && typeof current === "object" && depth < maxDepth) {
    const cause = current as Record<string, unknown>;
    if (typeof cause.data === "string" && cause.data.startsWith("0x")) {
      return cause.data;
    }
    current = cause.cause;
    depth++;
  }

  // Check error message for embedded hex error selector
  const message = typeof err.message === "string" ? err.message : "";
  const hexMatch = message.match(/\b(0x[a-fA-F0-9]{8})\b/);
  if (hexMatch) {
    return hexMatch[1];
  }

  return undefined;
}

/**
 * Get a user-friendly error message for a contract error.
 *
 * @param error - The error object from a contract call
 * @returns A user-friendly error message, or undefined if error is not recognized
 */
export function getContractErrorMessage(error: unknown): string | undefined {
  const errorData = extractErrorData(error);
  if (errorData) {
    return CONTRACT_ERRORS[errorData];
  }
  return undefined;
}

/**
 * Check if an error is a known contract error.
 *
 * @param error - The error object to check
 * @returns True if the error is a known contract error
 */
export function isKnownContractError(error: unknown): boolean {
  const errorData = extractErrorData(error);
  return errorData !== undefined && errorData in CONTRACT_ERRORS;
}

/**
 * Handle a contract error by throwing a user-friendly error.
 *
 * This function extracts error data, maps it to a user-friendly message,
 * and throws an appropriate error. Use this in catch blocks after contract calls.
 *
 * @param error - The error from a contract call
 * @throws Always throws an error with a descriptive message
 */
export function handleContractError(error: unknown): never {
  // Extract error data from the error chain
  const errorData = extractErrorData(error);

  // Check for known contract error signatures
  if (errorData) {
    const knownError = CONTRACT_ERRORS[errorData];
    if (knownError) {
      throw new Error(knownError);
    }
  }

  // Check for gas estimation errors or internal JSON-RPC errors
  const errorMsg = (error as Error)?.message || "";
  if (
    errorMsg.includes("gas limit too high") ||
    errorMsg.includes("21000000") ||
    errorMsg.includes("Internal JSON-RPC error")
  ) {
    // If we found error data but it's not in our known list, include it
    const errorHint = errorData ? ` (error code: ${errorData})` : "";
    throw new Error(
      `Transaction failed: The contract rejected this transaction${errorHint}. ` +
        "Possible causes: (1) Vault already exists for this transaction, " +
        "(2) Invalid signature, (3) Unauthorized caller. " +
        "Please check your transaction parameters and try again.",
    );
  }

  // Default: re-throw original error with better context
  if (error instanceof Error) {
    throw error;
  }
  throw new Error(`Contract call failed: ${String(error)}`);
}
