/**
 * Typed errors for device outcomes the consuming adapter must classify.
 * This package deliberately has no dependency on wallet-connector's
 * WalletError taxonomy — the adapter maps these at the seam. Matching is
 * by `name`, mirroring the DepositTermsRejectedError contract, so the
 * classification survives duplicated module instances.
 *
 * @module ledger-vault-signer/errors
 */

export const LEDGER_USER_REFUSED_ERROR_NAME = "LedgerUserRefusedError";
export const LEDGER_DEVICE_LOCKED_ERROR_NAME = "LedgerDeviceLockedError";
export const LEDGER_DEVICE_ERROR_NAME = "LedgerDeviceError";

function hex4(value: number): string {
  return value.toString(16).padStart(4, "0");
}

/**
 * The user declined the request on-device. The message keeps the
 * "User rejected" prefix — wallet-connector's `isUserRejectionMessage` and
 * the vault app's user-cancellation classifier match on it when a wrapper
 * drops the typed error.
 */
export class LedgerUserRefusedError extends Error {
  readonly statusWord: number;

  constructor(statusWord: number) {
    super(`User rejected the request on the Ledger device (0x${hex4(statusWord)})`);
    this.name = LEDGER_USER_REFUSED_ERROR_NAME;
    this.statusWord = statusWord;
  }
}

/** The device is locked; the request never reached the app. */
export class LedgerDeviceLockedError extends Error {
  readonly statusWord: number;

  constructor(statusWord: number) {
    super(`The Ledger device is locked — unlock it and retry (0x${hex4(statusWord)})`);
    this.name = LEDGER_DEVICE_LOCKED_ERROR_NAME;
    this.statusWord = statusWord;
  }
}

/**
 * Any other non-OK status word: the device rejected the request for a reason
 * the sender does not classify further. Carries the status word as data; the
 * message already names the instruction and mapped meaning.
 */
export class LedgerDeviceError extends Error {
  readonly statusWord: number;

  constructor(statusWord: number, message: string) {
    super(message);
    this.name = LEDGER_DEVICE_ERROR_NAME;
    this.statusWord = statusWord;
  }
}

export function isLedgerUserRefusedError(error: unknown): error is LedgerUserRefusedError {
  return error instanceof Error && error.name === LEDGER_USER_REFUSED_ERROR_NAME;
}

export function isLedgerDeviceError(error: unknown): error is LedgerDeviceError {
  return error instanceof Error && error.name === LEDGER_DEVICE_ERROR_NAME;
}

export function isLedgerDeviceLockedError(error: unknown): error is LedgerDeviceLockedError {
  return error instanceof Error && error.name === LEDGER_DEVICE_LOCKED_ERROR_NAME;
}
