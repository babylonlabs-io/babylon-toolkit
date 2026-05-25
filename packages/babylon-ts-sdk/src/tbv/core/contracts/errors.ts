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
  // ScriptPubKeyMismatch() - taproot output doesn't match expected script
  "0x4fec082d":
    "Script mismatch: The Bitcoin transaction's taproot output does not match the expected vault script. " +
    "This may be caused by incorrect vault participants or key configuration.",
  // InvalidBTCProofOfPossession()
  "0x6cc363a5":
    "Invalid BTC proof of possession: The signature could not be verified. " +
    "Please ensure you're signing with the correct Bitcoin wallet.",
  // InvalidBTCPublicKey()
  "0x6c3f2bf6":
    "Invalid BTC public key: The Bitcoin public key format is invalid.",
  // InvalidAmount()
  "0x2c5211c6":
    "Invalid amount: The deposit amount is invalid or below the minimum required.",
  // ApplicationNotRegistered()
  "0x0405f772":
    "Application not registered: The application controller is not registered in the system.",
  // InvalidProviderStatus()
  "0x24e165cc":
    "Invalid provider status: The vault provider is not in a valid state to accept deposits.",
  // ZeroAddress()
  "0xd92e233d":
    "Zero address: One of the required addresses is the zero address.",
  // BtcKeyMismatch()
  "0x65aa7007":
    "BTC key mismatch: The Bitcoin public key does not match the expected key.",
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
  // InvalidPeginFee(uint256,uint256)
  "0x979f4518":
    "Invalid pegin fee: The ETH fee sent does not match the required amount. " +
    "This may indicate a fee rate change during the transaction.",
  // PrePeginOutputAlreadyUsed()
  "0x5fad9694":
    "This pre-pegin output has already been used to activate another vault.",
  // PeginTransactionAlreadyUsed()
  "0x7ed061c9":
    "This pegin transaction has already been used to activate another vault.",
  // DuplicateHashlock() — keccak256(abi.encodePacked(hashlock, msg.sender))
  // collision in BTCVaultRegistry.hashlockToVaultId. Hashlocks are derived
  // deterministically from the depositor's BTC wallet + selected UTXOs, so
  // reusing the same UTXOs from the same wallet (even after a previous
  // vault expires) produces the same hashlock and reverts here.
  "0x70f7d5e2":
    "Duplicate deposit: a BTC Vault with this hashlock is already registered to your wallet. Hashlocks are derived from your BTC wallet and selected UTXOs — use different UTXOs to create a unique deposit.",
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
  return walkForErrorData(error, 0);
}

/**
 * Walk an error chain looking for revert data in any of viem 2.x's known
 * shapes. Covers:
 *  - `.data: "0x..."` — raw revert hex (most common with `estimateGas`)
 *  - `.revertData: "0x..."` — alternate viem shape
 *  - `.signature: "0x..."` — 4-byte selector from a *decoded*
 *    ContractFunctionRevertedError (set when the ABI included the error def)
 *  - `.error.data: "0x..."` — RPC-level error shape from some providers
 *  - `.walk(fn)` — viem's chainable error walker (BaseError.walk)
 *  - `.cause` chain — viem wraps errors many layers deep
 *
 * Depth-limited (10) and walk-result-deduplicated so a cycle can't loop.
 */
function walkForErrorData(
  error: unknown,
  depth: number,
): string | undefined {
  if (depth > 10 || !error || typeof error !== "object") return undefined;

  const err = error as Record<string, unknown>;

  if (typeof err.data === "string" && err.data.startsWith("0x")) {
    return err.data;
  }
  if (typeof err.revertData === "string" && err.revertData.startsWith("0x")) {
    return err.revertData;
  }
  if (typeof err.signature === "string" && err.signature.startsWith("0x")) {
    return err.signature;
  }
  if (typeof err.details === "string" && err.details.startsWith("0x")) {
    return err.details;
  }

  // RPC-level error shape (`{ error: { data: "0x..." } }`)
  if (err.error && typeof err.error === "object") {
    const inner = (err.error as Record<string, unknown>).data;
    if (typeof inner === "string" && inner.startsWith("0x")) {
      return inner;
    }
  }

  // Recurse through `.cause`
  if (err.cause) {
    const fromCause = walkForErrorData(err.cause, depth + 1);
    if (fromCause) return fromCause;
  }

  // Use viem's `.walk()` if available
  if (typeof err.walk === "function") {
    try {
      let found: string | undefined;
      (err.walk as (fn: (e: unknown) => boolean) => unknown)((e) => {
        if (e === error) return false; // avoid self-cycle
        const data = walkForErrorData(e, depth + 1);
        if (data) {
          found = data;
          return true;
        }
        return false;
      });
      if (found) return found;
    } catch {
      // walk failed; ignore
    }
  }

  // Last resort: regex an embedded hex selector out of the message
  if (depth === 0) {
    const message = typeof err.message === "string" ? err.message : "";
    const hexMatch = message.match(/\b(0x[a-fA-F0-9]{8})\b/);
    if (hexMatch) return hexMatch[1];
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
    // Check exact match first, then match by 4-byte selector prefix.
    // Parametric errors (e.g. InvalidPeginFee(uint256,uint256)) return
    // the selector + ABI-encoded args, so the full string won't match.
    const selector = errorData.substring(0, 10); // "0x" + 4 bytes
    return CONTRACT_ERRORS[errorData] ?? CONTRACT_ERRORS[selector];
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
  if (errorData === undefined) return false;
  const selector = errorData.substring(0, 10);
  return errorData in CONTRACT_ERRORS || selector in CONTRACT_ERRORS;
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
  // Log full error for debugging
  console.error("[Contract Error] Raw error:", error);

  // Extract error data from the error chain
  const errorData = extractErrorData(error);
  console.error("[Contract Error] Extracted error data:", errorData);

  // Check for known contract error signatures (exact match or 4-byte selector prefix)
  if (errorData) {
    const selector = errorData.substring(0, 10);
    const knownError = CONTRACT_ERRORS[errorData] ?? CONTRACT_ERRORS[selector];
    if (knownError) {
      console.error("[Contract Error] Known error:", knownError);
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
    console.error(
      "[Contract Error] Transaction rejected. Error code:",
      errorData,
      "Message:",
      errorMsg,
    );
    throw new Error(
      `Transaction failed: The contract rejected this transaction${errorHint}. ` +
        "Possible causes: (1) Vault already exists for this transaction, " +
        "(2) Invalid signature, (3) Unauthorized caller. " +
        "Please check your transaction parameters and try again.",
    );
  }

  // Default: re-throw original error with better context
  if (error instanceof Error) {
    console.error("[Contract Error] Unhandled error:", error.message);
    throw error;
  }
  throw new Error(`Contract call failed: ${String(error)}`);
}
