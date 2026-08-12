/**
 * Binds our {@link ApduSender} seam to DMK's public raw-APDU transport;
 * every vault instruction rides this seam, including the future SIGN_PSBT
 * loop (#2109). Debugging: `globalThis.__LEDGER_VAULT_APDU_TRACE__ = true`
 * logs header + status word per exchange — never payload bytes (pubkeys,
 * context preimage).
 *
 * @module wallets/btc/ledger-vault/dmkApduSender
 */

import { ERROR_CODES, WalletError } from "@/error";

import type { DmkSessionHandle } from "./dmkSession";
import type { ApduSender } from "./vaultCommands";

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

const STATUS_WORD_BYTES = 2;

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

/**
 * A missing byte must not default to 0: `[0x90]` would read as 0x9000 —
 * a malformed response taken as an approval.
 */
function statusWordOf(response: { statusCode: Uint8Array }): number {
  if (response.statusCode.length !== STATUS_WORD_BYTES) {
    throw new Error(
      `The device returned a ${response.statusCode.length}-byte status word; ` + `expected ${STATUS_WORD_BYTES}.`,
    );
  }
  return (response.statusCode[0] << 8) | response.statusCode[1];
}

/** Serialise to the wire form: CLA ‖ INS ‖ P1 ‖ P2 ‖ Lc ‖ DATA. */
function encodeApdu(apdu: { cla: number; ins: number; p1: number; p2: number; data: Uint8Array }): Uint8Array {
  if (apdu.data.length > 0xff) {
    throw new Error(`APDU data is ${apdu.data.length} bytes; Lc is a single byte (max 255)`);
  }
  const out = new Uint8Array(5 + apdu.data.length);
  out[0] = apdu.cla;
  out[1] = apdu.ins;
  out[2] = apdu.p1;
  out[3] = apdu.p2;
  out[4] = apdu.data.length;
  out.set(apdu.data, 5);
  return out;
}

function traceEnabled(): boolean {
  return (globalThis as { __LEDGER_VAULT_APDU_TRACE__?: boolean }).__LEDGER_VAULT_APDU_TRACE__ === true;
}

function hex2(value: number): string {
  return value.toString(16).padStart(2, "0");
}

function hex4(value: number): string {
  return value.toString(16).padStart(4, "0");
}

/**
 * Build a sender bound to one device session. A `sessionId` must never outlive
 * its connection — recreate the sender whenever the session changes.
 */
export function createDmkApduSender(handle: DmkSessionHandle): ApduSender {
  return async (apdu) => {
    const header = `${hex2(apdu.cla)} ${hex2(apdu.ins)} ${hex2(apdu.p1)} ${hex2(apdu.p2)} Lc=${apdu.data.length}`;

    let response: { statusCode: Uint8Array; data: Uint8Array };
    try {
      response = await handle.dmk.sendApdu({
        sessionId: handle.sessionId,
        apdu: encodeApdu(apdu),
      });
    } catch (error) {
      if (traceEnabled()) console.debug(`[ledger-vault] APDU ${header} -> transport error`, error);
      throw error;
    }

    const sw = statusWordOf(response);
    if (traceEnabled()) {
      console.debug(`[ledger-vault] APDU ${header} -> sw=0x${hex4(sw)} len=${response.data.length}`);
    }

    // A decline is a user action, not a failure. The message starts "User
    // rejected" so the app still classifies it if a wrapper drops the code.
    // No `wallet` field — provider.ts imports this module (import cycle).
    if (SW_USER_REFUSED.has(sw)) {
      throw new WalletError({
        code: ERROR_CODES.CONNECTION_REJECTED,
        message: `User rejected the request on the Ledger device (0x${hex4(sw)})`,
      });
    }
    if (SW_DEVICE_LOCKED.has(sw)) {
      throw new WalletError({
        code: ERROR_CODES.CONNECTION_FAILED,
        message: `The Ledger device is locked — unlock it and retry (0x${hex4(sw)})`,
      });
    }
    if (sw !== SW_OK) {
      const known = STATUS_WORDS[sw];
      // Name the app seen at connect ("BOLOS" = dashboard); the user may have
      // switched apps since, hence the phrasing.
      const appHint =
        sw === SW_CLA_NOT_SUPPORTED && handle.appName
          ? ` (app at connect time: "${handle.appName}"${handle.appVersion ? ` v${handle.appVersion}` : ""})`
          : "";
      throw new Error(
        `${known ?? "The device rejected the request"} ` +
          `(ins 0x${hex2(apdu.ins)} p1 0x${hex2(apdu.p1)}, sw 0x${hex4(sw)})${appHint}`,
      );
    }
    return response.data;
  };
}
