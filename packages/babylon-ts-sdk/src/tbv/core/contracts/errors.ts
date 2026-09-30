/**
 * Contract Error Handling Utilities
 *
 * Provides utilities for extracting and handling contract revert errors.
 * Maps known error selectors to user-friendly messages.
 *
 * @module contracts/errors
 */

import { decodeAbiParameters, type Hex, toFunctionSelector } from "viem";

/**
 * `PeginFingerprintChanged(bytes32 expected, bytes32 actual)`.
 *
 * Re-derived rather than copied: `keccak256("PeginFingerprintChanged(bytes32,bytes32)")`
 * begins `0x846c25bb`. Source is
 * https://github.com/babylonlabs-io/vault-contracts-aave-v4/pull/555, and the
 * value matches that repo's generated `snapshots/selectors.md` at head
 * 86577e40. `BTCVaultRegistry.abi.ts` carries the matching error entry, and a
 * test asserts the two agree.
 */
export const PEGIN_FINGERPRINT_CHANGED_SELECTOR = "0x846c25bb";

/**
 * Shown when the contract reverted with explicitly empty data (`0x`). That can
 * mean a revert with no reason or a call the contract does not recognise, so
 * the wording claims neither.
 */
export const EMPTY_REVERT_MESSAGE =
  "The contract rejected this deposit without giving a reason. " +
  "Refresh the app and try again; if it keeps happening, contact support.";

/** `"0x"` + 4-byte selector + two abi-encoded `bytes32` words. */
const FINGERPRINT_REVERT_DATA_LENGTH = 2 + 8 + 64 * 2;

/**
 * The registry rejected a peg-in registration because the protocol state it
 * resolves at inclusion no longer matches the state the Pre-Pegin was built
 * against.
 *
 * Typed rather than one more entry in {@link CONTRACT_ERRORS} because the
 * consuming app has to branch on it — this is the one contract revert on the
 * peg-in path with a specific recovery, and matching an English message across
 * a package boundary to find it would be a string nobody can safely reword.
 *
 * `expected` and `actual` are the depositor's fingerprint and the registry's.
 * They are diagnostics only — the difference between "the chain moved" and
 * "our encoder is wrong" — and must never be shown to a depositor.
 */
export class PeginFingerprintChangedError extends Error {
  readonly expected?: Hex;
  readonly actual?: Hex;

  constructor(message: string, fingerprints?: { expected: Hex; actual: Hex }) {
    super(message);
    this.name = "PeginFingerprintChangedError";
    this.expected = fingerprints?.expected;
    this.actual = fingerprints?.actual;
  }
}

// `instanceof` alone fails across module boundaries (duplicate copies, test
// mocks). Fall back to the name field, as the sibling drift guards do.
export function isPeginFingerprintChangedError(
  err: unknown,
): err is PeginFingerprintChangedError {
  return (
    err instanceof PeginFingerprintChangedError ||
    (err instanceof Error && err.name === "PeginFingerprintChangedError")
  );
}

/**
 * Recover the two fingerprints from the revert payload, when there is one.
 *
 * `extractErrorData` sometimes yields only the 4-byte selector — a viem
 * `ContractFunctionRevertedError` that has already decoded the error exposes
 * its signature, not its raw data. Classification has already happened on that
 * selector by the time this runs, so returning `undefined` here loses a
 * diagnostic and nothing else. That is why this may return `undefined` on a
 * critical path and the selector match may not.
 */
function decodeFingerprints(
  errorData: string,
): { expected: Hex; actual: Hex } | undefined {
  if (errorData.length !== FINGERPRINT_REVERT_DATA_LENGTH) return undefined;
  try {
    const [expected, actual] = decodeAbiParameters(
      [{ type: "bytes32" }, { type: "bytes32" }],
      `0x${errorData.slice(10)}` as Hex,
    );
    return { expected, actual };
  } catch {
    return undefined;
  }
}

/**
 * Peg-in registration reverts, keyed by error signature. Every signature must
 * exist in `vaultErrors.manifest.json` (a test enforces it); selectors are
 * derived from the signature, never written by hand.
 */
const PEGIN_ERROR_MESSAGES: Record<string, string> = {
  "VaultAlreadyExists()":
    "Vault already exists: This Bitcoin transaction has already been registered. " +
    "Please select different UTXOs or use a different amount to create a unique transaction.",
  "InvalidBTCProofOfPossession()":
    "Invalid BTC proof of possession: The signature has an invalid length. " +
    "Please ensure you're signing with the correct Bitcoin wallet.",
  "InvalidBTCPublicKey()":
    "Invalid BTC public key: The Bitcoin public key format is invalid.",
  "InvalidAmount()":
    "Invalid amount: The deposit amount is invalid or below the minimum required.",
  "ApplicationNotRegistered()":
    "Application not registered: The application controller is not registered in the system.",
  "ZeroAddress()":
    "Vault provider not registered: The selected vault provider is not registered.",
  "Unauthorized()":
    "Unauthorized: Only the depositor can submit this transaction. Reconnect the wallet you started this deposit with.",
  "InvalidPeginFee(uint256,uint256)":
    "Invalid pegin fee: The ETH fee sent does not match the required amount. " +
    "This may indicate a fee rate change during the transaction.",
  "PrePeginOutputAlreadyUsed()":
    "This Bitcoin output is already registered for one of your vaults. " +
    "Select different UTXOs to create a new deposit.",
  // keccak256(abi.encodePacked(hashlock, msg.sender)) collision in
  // BTCVaultRegistry.hashlockToVaultId. Hashlocks are derived from the
  // depositor's BTC wallet and selected UTXOs, so reusing the same UTXOs from
  // the same wallet (even after a previous vault expires) reverts here.
  "DuplicateHashlock()":
    "Duplicate deposit: a BTC Vault with this hashlock is already registered to your wallet. Hashlocks are derived from your BTC wallet and selected UTXOs — use different UTXOs to create a unique deposit.",
  "DepositorWotsPkHashAlreadyUsed()":
    "Duplicate deposit: these deposit keys are already registered to your wallet. " +
    "Select different UTXOs to create a new deposit.",
  "TooManyFundingInputs(uint256,uint256)":
    "Too many Bitcoin inputs: This deposit spends more UTXOs than the protocol allows. " +
    "Select fewer, larger UTXOs and try again.",
  "TooManyHtlcOutputs(uint256,uint256)":
    "Too many vaults in one deposit: Split this deposit into fewer vaults and try again.",
  "VaultBelowMinimum(uint256,uint256)":
    "Deposit too small: Each vault must be at least the protocol minimum. Increase the amount and try again.",
  "VaultAboveMaximum(uint256,uint256)":
    "Deposit too large: Each vault must be at most the protocol maximum. Reduce the amount and try again.",
  "VaultProviderCommissionExceeded(uint16,uint16)":
    "Vault provider commission changed: The provider's commission is now above the limit you accepted. " +
    "Review the new commission and try again.",
  "DepositNotAllowed()":
    "Deposit not allowed: Your address is not on this application's allow list.",
  "CapExceeded()":
    "Deposit cap reached: This deposit would exceed the application's total deposit cap " +
    "or your wallet's deposit cap. Try a smaller amount.",
  "LiveVaultCapExceeded()":
    "Vault limit reached: The protocol has no vault capacity left right now. Please try again later.",
  "ApplicationNotActive()":
    "Application unavailable: This application is not accepting deposits right now. Please try again later.",
  "TBV_Paused()":
    "The protocol is paused. Please try again later.",
  "TBV_Frozen()":
    "This action isn't available while the system is frozen.",
};

/**
 * Known peg-in contract error selectors mapped to user-friendly messages.
 *
 * Error selectors are the first 4 bytes of keccak256(error signature).
 */
export const CONTRACT_ERRORS: Record<string, string> = Object.fromEntries(
  Object.entries(PEGIN_ERROR_MESSAGES).map(([signature, message]) => [
    toFunctionSelector(signature),
    message,
  ]),
);

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
 * Reads {@link CONTRACT_ERRORS} only, so it reports `PeginFingerprintChanged`
 * as unrecognised even though {@link handleContractError} throws a typed error
 * for it. That revert deliberately has no message-table entry: consumers branch
 * on {@link PeginFingerprintChangedError} and supply their own copy.
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
 * "Known" means present in {@link CONTRACT_ERRORS}, so this returns `false` for
 * `PeginFingerprintChanged` — see {@link getContractErrorMessage} for why that
 * revert is typed instead of tabled. Use
 * {@link isPeginFingerprintChangedError} to recognise it.
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

    // Typed ahead of the message map: the peg-in path branches on this one
    // rather than rendering it, and the two fingerprints are worth keeping.
    //
    // Lowercased before comparing because `extractErrorData` accepts mixed-case
    // hex — its last-resort message regex matches `[a-fA-F0-9]`, and `err.data`
    // from an arbitrary RPC provider carries no casing guarantee. viem returns
    // lowercase in practice, so this is belt-and-braces; but the app branches
    // on this selector, and a silent miss would drop the whole recovery path.
    if (selector.toLowerCase() === PEGIN_FINGERPRINT_CHANGED_SELECTOR) {
      throw new PeginFingerprintChangedError(
        "Peg-in configuration fingerprint changed: the protocol state resolved " +
          "at inclusion differs from the state this deposit was built against.",
        decodeFingerprints(errorData),
      );
    }

    const knownError = CONTRACT_ERRORS[errorData] ?? CONTRACT_ERRORS[selector];
    if (knownError) {
      console.error("[Contract Error] Known error:", knownError);
      throw new Error(knownError);
    }

    // Revert data present but empty, as opposed to absent (no `errorData`).
    if (errorData === "0x") {
      throw new Error(EMPTY_REVERT_MESSAGE);
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
