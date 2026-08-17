/**
 * Transport seam for the SIGN_PSBT interrupt/continue loop (#2219).
 *
 * The ceremony's `ApduSender` throws on every status word except 0x9000;
 * SIGN_PSBT cannot ride it: `0xE000` (SW_INTERRUPTED_EXECUTION — a
 * client-command request follows in the response data) is loop input, and the
 * loop's one gated resend must see the first `0x6A80` after a host-abandoned
 * interruption as data too — the dispatcher answers any non-CONTINUE APDU
 * with 0x6A80 and drops the interrupted command (`base:dispatcher.c:107-111`
 * `process_interruption`); every other `0x6A80` is a terminal validation
 * failure. A {@link RawApduSender} therefore never throws on ANY status word;
 * terminal words are classified by the caller via {@link classifyStatusWord},
 * so raw-seam consumers and the throwing sender raise identical typed errors.
 *
 * @module ledger-vault-signer/rawApdu
 */

import { LedgerDeviceError, LedgerDeviceLockedError, LedgerUserRefusedError } from "./errors";

/** One APDU in the wire form the senders serialise: CLA ‖ INS ‖ P1 ‖ P2 ‖ Lc ‖ DATA. */
export interface Apdu {
  readonly cla: number;
  readonly ins: number;
  readonly p1: number;
  readonly p2: number;
  readonly data: Uint8Array;
}

/** Status word + response data, returned for every exchange — error words included. */
export interface RawApduResponse {
  readonly sw: number;
  readonly data: Uint8Array;
}

/**
 * Non-throwing transport: every status word comes back as data. Throws only
 * when there is no status word to return — transport failure, a malformed
 * (non-2-byte) status word, or a payload that cannot fit the single-byte Lc.
 */
export type RawApduSender = (apdu: Apdu) => Promise<RawApduResponse>;

const SW_OK = 0x9000;

/**
 * Mirrored from DMK 1.7.1 `CommandUtils.isRefusedByUser`; mirrored rather than
 * imported so this module keeps zero eager DMK imports. Which code each vault
 * screen returns, and whether a decline nullifies a loaded intent, is an open
 * question (#2110).
 */
const SW_USER_REFUSED = new Set([0x5501, 0x6985]);

/** Mirrored from DMK 1.7.1 `CommandUtils.isLockedDeviceResponse`. */
const SW_DEVICE_LOCKED = new Set([0x5515, 0x6982, 0x5303]);

/** CLA not supported — what the dashboard or a wrong app returns. */
const SW_CLA_NOT_SUPPORTED = 0x6e00;

/**
 * Vault status words (`app-babylon-vault` `sw.h`, #2110) plus the base-app
 * codes from the signer kit's published `BTC_APP_ERRORS`, mirrored so nothing
 * imports the kit. Unmapped words surface as raw hex rather than guesses.
 */
const STATUS_WORDS: Record<number, string> = {
  0x6a80: "The device rejected the data as invalid",
  // SW_NOT_SUPPORTED — for the silent key read this usually means the app
  // build (mainnet vs testnet coin type) does not match the selected network.
  0x6a82: "The device does not support this request — check that the app build matches the selected network",
  0x6a86: "The device rejected the instruction parameters",
  0x6a87: "The device rejected the payload length",
  0x6d00: "The running app does not support this instruction",
  [SW_CLA_NOT_SUPPORTED]: "The running app does not handle vault instructions — open the Babylon Vault app",
  0xb000: "The device reported a wrong response length",
  0xb007: "The device is not in the expected state for this step",
  0xb008: "The device rejected a signature or HMAC as invalid",
  0xb009: "The device rejected the CPFP anchor",
  0xb00a: "The device has already signed the maximum number of these transactions",
  0x6f00: "The device reported an internal error",
};

export function hex2(value: number): string {
  return value.toString(16).padStart(2, "0");
}

export function hex4(value: number): string {
  return value.toString(16).padStart(4, "0");
}

/** Request context woven into the error message (and the 0x6E00 app hint). */
export interface StatusWordContext {
  readonly ins: number;
  readonly p1: number;
  /** App name/version at connect time ("BOLOS" = dashboard). Diagnostic only. */
  readonly appName?: string;
  readonly appVersion?: string;
}

/**
 * Map a status word onto the typed error the throwing sender raises, or
 * `undefined` for 0x9000. Extracted from `createDmkApduSender` unchanged, so
 * DERIVE/APPROVE behaviour is bit-identical and the SIGN_PSBT loop classifies
 * its terminal words the same way. `0xE000` classifies as a plain device error
 * — the loop must consume it as data BEFORE classifying.
 */
export function classifyStatusWord(
  sw: number,
  context: StatusWordContext,
): LedgerUserRefusedError | LedgerDeviceLockedError | LedgerDeviceError | undefined {
  if (sw === SW_OK) {
    return undefined;
  }
  // A decline is a user action, not a failure. The typed errors carry the
  // status word; the consuming adapter maps them onto its own taxonomy.
  if (SW_USER_REFUSED.has(sw)) {
    return new LedgerUserRefusedError(sw);
  }
  if (SW_DEVICE_LOCKED.has(sw)) {
    return new LedgerDeviceLockedError(sw);
  }
  const known = STATUS_WORDS[sw];
  // Name the app seen at connect ("BOLOS" = dashboard); the user may have
  // switched apps since, hence the phrasing.
  const appHint =
    sw === SW_CLA_NOT_SUPPORTED && context.appName
      ? ` (app at connect time: "${context.appName}"${context.appVersion ? ` v${context.appVersion}` : ""})`
      : "";
  return new LedgerDeviceError(
    sw,
    `${known ?? "The device rejected the request"} ` +
      `(ins 0x${hex2(context.ins)} p1 0x${hex2(context.p1)}, sw 0x${hex4(sw)})${appHint}`,
  );
}
