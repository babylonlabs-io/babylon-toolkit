/**
 * Transport seam for the SIGN_PSBT interrupt/continue loop (#2219).
 *
 * The ceremony's `ApduSender` throws on every status word except 0x9000;
 * SIGN_PSBT cannot ride it: `0xE000` (SW_INTERRUPTED_EXECUTION — a
 * client-command request follows in the response data) is loop input, not an
 * error. A {@link RawApduSender} therefore never throws on ANY status word;
 * terminal words are classified by the caller via {@link classifyStatusWord},
 * so raw-seam consumers and the throwing sender raise identical typed errors.
 *
 * Citation legend — `base:` = LedgerHQ/app-bitcoin branch `baseapp` @ `e400d8d8`
 * (`src/boilerplate/sw.h`); the same path on `develop` differs. `sdk:` =
 * LedgerHQ/ledger-secure-sdk @ tag `v26.6.1`, the SDK app 0.10.1 builds against.
 * `fw:` = LedgerHQ/app-babylon-vault @ `b0c0ac4d` (app 0.10.1).
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
export const SW_CLA_NOT_SUPPORTED = 0x6e00;
/**
 * INS not supported. The vault app is built on `bitcoin_app_base`
 * (`base:src/boilerplate/dispatcher.c:170-171` @ e400d8d8). The stock Bitcoin
 * app shares CLA 0xE1 and answers this for a vault instruction it does not
 * implement (LedgerHQ/app-bitcoin-new @ da3c8c9d: `src/constants.h:10`,
 * `src/boilerplate/dispatcher.c:160-161`). A known class without the vault
 * instructions is a wrong app.
 */
export const SW_INS_NOT_SUPPORTED = 0x6d00;

/** SW_BAD_STATE — the loaded intent/root is gone (`base:src/boilerplate/sw.h:80` @ e400d8d8). */
export const SW_BAD_STATE = 0xb007;
/** SW_CAP_EXCEEDED — per-type signature cap or dedup-mask breach; intent nullified (`fw:sign_psbt_validate.c:52` @ b0c0ac4d). */
export const SW_CAP_EXCEEDED = 0xb00a;

/**
 * Vault status words (the app has no `sw.h`; its own words are `SW_BAD_CPFP_ANCHOR`
 * and `SW_CAP_EXCEEDED` at `fw:sign_psbt_validate.c:50,52` and `SW_BIP32_FAIL` in
 * the handlers; 0xB000/0xB007/0xB008 come from `base:src/boilerplate/sw.h` @ e400d8d8) plus the base-app codes from the signer
 * kit's published `BTC_APP_ERRORS`, mirrored so nothing imports the kit.
 * Unmapped words surface as raw hex rather than guesses.
 */
const STATUS_WORDS: Record<number, string> = {
  0x6a80: "The device rejected the data as invalid",
  // SW_NOT_SUPPORTED — for the silent key read this usually means the app
  // build (mainnet vs testnet coin type) does not match the selected network.
  0x6a82: "The device does not support this request — check that the app build matches the selected network",
  0x6a86: "The device rejected the instruction parameters",
  0x6a87: "The device rejected the payload length",
  [SW_INS_NOT_SUPPORTED]: "The running app does not support this instruction",
  // SWO_COMMAND_NOT_ACCEPTED (`sdk:include/status_words.h:56`) — sent by the SDK
  // IO layer before dispatch, so the app never ran the command: from the UX
  // heartbeat when an APDU lands mid-approval (`sdk:io_legacy/src/os_io_legacy.c:132`,
  // already in v26.6.0) and, new in v26.6.1, when a command arrives while a
  // reply is still pending (`:400-412`).
  // Retry advice omitted on purpose: a 0x6901 currently takes the provider's
  // pessimistic reset, so retrying fails until #2530 keeps the intent.
  0x6901: "The device was still busy with the previous request",
  // Network-agnostic on purpose: the app is "Babylon Vault" on mainnet and
  // "Babylon Vault Testnet" on test networks (dmkSession.readAppAndVersion).
  [SW_CLA_NOT_SUPPORTED]:
    "The running app does not handle vault instructions — open the Babylon Vault app for this network",
  0xb000: "The device reported a wrong response length",
  [SW_BAD_STATE]: "The device is not in the expected state for this step",
  0xb008: "The device rejected a signature or HMAC as invalid",
  0xb009: "The device rejected the CPFP anchor",
  [SW_CAP_EXCEEDED]: "The device has already signed the maximum number of these transactions",
  0x6f00: "The device reported an internal error",
};

export function hex2(value: number): string {
  return value.toString(16).padStart(2, "0");
}

export function hex4(value: number): string {
  return value.toString(16).padStart(4, "0");
}

/**
 * App name/version captured at connect time ("BOLOS" = dashboard). In this
 * module it only shapes the wrong-app message; the host gates connect on it.
 * Optional because the raw seam is an opaque function — a caller driving a bare
 * transport (the Speculos e2e client) has nothing to report.
 */
export interface AppIdentity {
  readonly appName?: string;
  readonly appVersion?: string;
}

/** Request context woven into the error message (and the 0x6E00 app hint). */
export interface StatusWordContext extends AppIdentity {
  readonly ins: number;
  readonly p1: number;
  /** SIGN_PSBT loop only: the refused APDU was the initial SIGN_PSBT, before any round ran. */
  readonly preDispatch?: boolean;
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
    return new LedgerDeviceLockedError(sw, { preDispatch: context.preDispatch === true });
  }
  const known = STATUS_WORDS[sw];
  // Name the app seen at connect ("BOLOS" = dashboard); the user may have
  // switched apps since, hence the phrasing.
  const appHint =
    (sw === SW_CLA_NOT_SUPPORTED || sw === SW_INS_NOT_SUPPORTED) && context.appName
      ? ` (app at connect time: "${context.appName}"${context.appVersion ? ` v${context.appVersion}` : ""})`
      : "";
  return new LedgerDeviceError(
    sw,
    `${known ?? "The device rejected the request"} ` +
      `(ins 0x${hex2(context.ins)} p1 0x${hex2(context.p1)}, sw 0x${hex4(sw)})${appHint}`,
  );
}

/**
 * Re-base a {@link RawApduSender} as the ceremony's throwing sender: data on
 * 0x9000, the shared typed error otherwise. The single place that pairing is
 * written — `createDmkApduSender` and the Speculos e2e client's sender both
 * re-base on it, so a decline reads identically over either transport. The
 * 0x6E00 app hint appears only when the caller supplies an identity (the
 * Speculos client has none). Structural return type is `ApduSender`.
 */
export function createThrowingApduSender(
  sendRaw: RawApduSender,
  appIdentity?: AppIdentity,
): (apdu: Apdu) => Promise<Uint8Array> {
  return async (apdu) => {
    const { sw, data } = await sendRaw(apdu);
    const error = classifyStatusWord(sw, { ...appIdentity, ins: apdu.ins, p1: apdu.p1 });
    if (error) throw error;
    return data;
  };
}
