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
export const LEDGER_YIELD_MISMATCH_ERROR_NAME = "LedgerYieldMismatchError";
export const LEDGER_SIGN_PSBT_INCOMPLETE_ERROR_NAME = "LedgerSignPsbtIncompleteError";
export const LEDGER_SIGN_PSBT_PROTOCOL_ERROR_NAME = "LedgerSignPsbtProtocolError";
export const LEDGER_SIGN_PSBT_ABORTED_ERROR_NAME = "LedgerSignPsbtAbortedError";

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

export type LedgerYieldMismatchKind =
  | "unexpected-input"
  | "wrong-spend-type"
  | "wrong-signer-key"
  | "unknown-leaf-hash"
  | "non-default-sighash"
  | "duplicate-yield"
  | "unexpected-encoding";

/**
 * A SIGN_PSBT YIELD failed the expected-signature table assertion — a
 * misrouted signature caught before it is ever recorded or merged. The loop
 * stops sending CONTINUEs and never retries a YIELD (per-type signature caps
 * and the payout claimer mask make a replayed SIGN_PSBT after partial YIELDs
 * non-idempotent — fw `sign_custom_inputs.c:180-181,348-352`).
 */
export class LedgerYieldMismatchError extends Error {
  readonly kind: LedgerYieldMismatchKind;
  readonly inputIndex?: number;

  constructor(kind: LedgerYieldMismatchKind, inputIndex?: number) {
    super(
      `The device yielded a signature that fails the expected-signature table ` +
        `(${kind}${inputIndex === undefined ? "" : ` on input ${inputIndex}`})`,
    );
    this.name = LEDGER_YIELD_MISMATCH_ERROR_NAME;
    this.kind = kind;
    this.inputIndex = inputIndex;
  }
}

/**
 * SIGN_PSBT ended 0x9000 but the collected yields are not set-equal to the
 * expected table — e.g. the device silently skipped an input. Failing here
 * loudly prevents a half-signed PSBT from reaching the merge.
 */
export class LedgerSignPsbtIncompleteError extends Error {
  /** Missing (input, leaf) units: `"i:leafHex"` for tapscript, `"i"` for keypath. */
  readonly missing: readonly string[];

  constructor(missing: readonly string[]) {
    super(
      `The device completed SIGN_PSBT without yielding every expected signature ` +
        `(missing ${missing.length}: ${missing.join(", ")})`,
    );
    this.name = LEDGER_SIGN_PSBT_INCOMPLETE_ERROR_NAME;
    this.missing = missing;
  }
}

/**
 * Non-secret identity of one accepted YIELD: which input it signed, and for a
 * tapscript spend which taptree leaf — a public value the input's control
 * block already commits to. It deliberately carries NO signature material:
 * an Error is the object most likely to be `console.error`'d or shipped to
 * telemetry, and both that and `JSON.stringify` serialize own enumerable
 * properties, so anything attached here is effectively logged (CLAUDE.md
 * critical path #7 — never log signatures or payload bytes).
 */
export interface CollectedYieldRef {
  readonly inputIndex: number;
  /** Lowercase-hex tapleaf hash; absent on keypath spends. */
  readonly leafHashHex?: string;
  /** Type-level guard: makes a full `CollectedYield` fail to assign here. */
  readonly signature?: never;
}

/**
 * Strip accepted yields down to their identity. The parameter is structural so
 * this module imports nothing, and every returned object is fresh — no
 * signature bytes ride along by reference.
 */
export function toCollectedYieldRefs(
  yields: readonly { readonly inputIndex: number; readonly leafHashHex?: string }[],
): readonly CollectedYieldRef[] {
  return yields.map(({ inputIndex, leafHashHex }) =>
    leafHashHex === undefined ? { inputIndex } : { inputIndex, leafHashHex },
  );
}

/**
 * A host-side SIGN_PSBT protocol failure: a prepare-time rejection, an
 * unparseable YIELD payload, or an interpreter request outside the committed
 * PSBT material. With our commitments seeded up front, these mean host bug or
 * corrupted exchange — never a user action.
 */
export class LedgerSignPsbtProtocolError extends Error {
  readonly detail: string;
  /**
   * Which yields the device had already delivered when the failure hit, by
   * identity only (see {@link CollectedYieldRef}); empty for prepare-time
   * rejections, which run before any device I/O. Diagnostics only — nothing in
   * this package reads them, and whether a failed ceremony burns the device
   * signatures is unresolved, so there is no retry or resume path here.
   */
  readonly collectedYields: readonly CollectedYieldRef[];

  constructor(detail: string, collectedYields: readonly CollectedYieldRef[] = []) {
    super(`SIGN_PSBT protocol failure: ${detail}`);
    this.name = LEDGER_SIGN_PSBT_PROTOCOL_ERROR_NAME;
    this.detail = detail;
    this.collectedYields = collectedYields;
  }
}

/**
 * The host abandoned the SIGN_PSBT loop (abort signal) — the loop stops
 * sending, nothing else. What the device does next (verified at base app rev
 * `e400d8d8` + fw `6fcad4fd`):
 *
 * - Within ~5 s (50 ticks, `base:io_ext.h:28`) the device sits blocked
 *   awaiting CONTINUE; the next non-CONTINUE APDU is eaten with 0x6A80 and the
 *   interrupted handler unwinds (`base:dispatcher.c:107-111`) — a direct retry
 *   uses `resendOnceOnIncorrectData`.
 * - A validation-phase abandonment leaves the intent intact; a Payout/NoPayout
 *   SIGNING-phase abandonment invalidates it (`fw:sign_custom_inputs.c:207-344`)
 *   — post-abort "intent-loaded" is a HINT only, and the retry path must also
 *   absorb 0xB007.
 * - After >5 s of host silence the app exits to the dashboard
 *   (`base:io_ext.c:103-111` → SDK `app_exit()`); the host then sees 0x6E00 or
 *   a transport failure — full re-ceremony required.
 */
export class LedgerSignPsbtAbortedError extends Error {
  /** Yields the device had already delivered when the host stopped sending. */
  readonly yieldedCount: number;

  constructor(yieldedCount: number) {
    super("SIGN_PSBT was abandoned host-side before completion");
    this.name = LEDGER_SIGN_PSBT_ABORTED_ERROR_NAME;
    this.yieldedCount = yieldedCount;
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

export function isLedgerYieldMismatchError(error: unknown): error is LedgerYieldMismatchError {
  return error instanceof Error && error.name === LEDGER_YIELD_MISMATCH_ERROR_NAME;
}

export function isLedgerSignPsbtIncompleteError(error: unknown): error is LedgerSignPsbtIncompleteError {
  return error instanceof Error && error.name === LEDGER_SIGN_PSBT_INCOMPLETE_ERROR_NAME;
}

export function isLedgerSignPsbtProtocolError(error: unknown): error is LedgerSignPsbtProtocolError {
  return error instanceof Error && error.name === LEDGER_SIGN_PSBT_PROTOCOL_ERROR_NAME;
}

export function isLedgerSignPsbtAbortedError(error: unknown): error is LedgerSignPsbtAbortedError {
  return error instanceof Error && error.name === LEDGER_SIGN_PSBT_ABORTED_ERROR_NAME;
}
