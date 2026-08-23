/**
 * Typed hardware-device error codes from the wallet connector. Inlined like
 * userCancellation.ts (drift-guarded in formatting.test.ts); nothing here may
 * import from formatting.ts or depositErrors.ts.
 */

/** Device ceremony state unusable — the flow must restart from derivation. */
export const DEVICE_CEREMONY_INVALID_CODE = "DEVICE_CEREMONY_INVALID";
/** Hardware device is PIN-locked. */
export const DEVICE_LOCKED_CODE = "DEVICE_LOCKED";
/** Wrong app open on the hardware device. */
export const DEVICE_WRONG_APP_CODE = "DEVICE_WRONG_APP";

/** How far to walk a `cause` chain before giving up. */
const MAX_CAUSE_DEPTH = 10;

const DEVICE_CODES = [
  DEVICE_CEREMONY_INVALID_CODE,
  DEVICE_LOCKED_CODE,
  DEVICE_WRONG_APP_CODE,
] as const;

export type DeviceErrorCode = (typeof DEVICE_CODES)[number];

/**
 * Device code on THIS frame only (no cause walk) — runs before the walking
 * buckets so an outer device error is never shadowed by an inner code.
 */
export function deviceErrorCodeOfFrame(
  frame: unknown,
): DeviceErrorCode | undefined {
  if (!frame || typeof frame !== "object") return undefined;
  const { code } = frame as { code?: unknown };
  return DEVICE_CODES.find((c) => c === code);
}

/**
 * True when the error or its cause chain carries the code. Cause-walking:
 * callers must run it AFTER their typed top-frame buckets.
 */
function chainCarriesCode(error: unknown, code: string): boolean {
  let cur: unknown = error;
  for (let depth = 0; depth <= MAX_CAUSE_DEPTH && cur != null; depth++) {
    if (typeof cur !== "object") return false;
    if ((cur as { code?: unknown }).code === code) return true;
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

export function isDeviceCeremonyInvalidError(error: unknown): boolean {
  return chainCarriesCode(error, DEVICE_CEREMONY_INVALID_CODE);
}

export function isDeviceLockedError(error: unknown): boolean {
  return chainCarriesCode(error, DEVICE_LOCKED_CODE);
}

export function isDeviceWrongAppError(error: unknown): boolean {
  return chainCarriesCode(error, DEVICE_WRONG_APP_CODE);
}
