/**
 * Binds our {@link ApduSender} seam to DMK's raw-APDU escape hatch.
 *
 * `dmk.sendApdu({ sessionId, apdu })` is public API and takes raw bytes, which
 * is what lets us drive a sideloaded app that has no published signer kit.
 * Verified against `@ledgerhq/device-management-kit@1.7.1`
 * (`DeviceManagementKit.d.ts:85`, `SendApduUseCase.d.ts:8-20`).
 *
 * @module wallets/btc/ledger-vault/dmkApduSender
 */

import { ERROR_CODES, WalletError } from "@/error";

import type { DmkSessionHandle } from "./dmkSession";
import type { ApduSender } from "./vaultCommands";

/** Success status word. */
const SW_OK = 0x9000;

/** The user declined on the device. Never invalidates — the APDU can be re-sent. */
const SW_DENY = 0x6985;

/** Status words are always exactly two bytes. */
const STATUS_WORD_BYTES = 2;

/**
 * Status words the vault app and its base return, mapped to messages worth
 * showing. Anything else is surfaced as raw hex rather than guessed at —
 * Ledger has not published the full taxonomy yet (#2110).
 */
const STATUS_WORDS: Record<number, string> = {
  0x6a80: "The device rejected the data as invalid",
  0x6a86: "The device rejected the instruction parameters",
  0x6a87: "The device rejected the payload length",
  0xb007: "The device is not in the expected state for this step",
  0xb009: "The device rejected the CPFP anchor",
  0xb00a: "The device has already signed the maximum number of these transactions",
  0x6f00: "The device reported an internal error",
};

/**
 * A status word is exactly two bytes. Defaulting a missing byte to 0 would read
 * a 1-byte `[0x90]` as 0x9000 — i.e. treat a malformed response as success, and
 * for APPROVE_VAULT_INTENT that means believing the device approved when it did
 * not. Anything other than two bytes is a protocol violation, not a status.
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

/**
 * Build a sender bound to one device session.
 *
 * The handle is captured per session because a `sessionId` must never outlive
 * its connection — recreate the sender whenever the session changes.
 */
export function createDmkApduSender(handle: DmkSessionHandle): ApduSender {
  return async (apdu) => {
    const response = await handle.dmk.sendApdu({
      sessionId: handle.sessionId,
      apdu: encodeApdu(apdu),
    });

    const sw = statusWordOf(response);
    // Declining is a user action, not a failure. The message deliberately starts
    // "User rejected" so the app still classifies it if a wrapper drops the code.
    // No `wallet` field: provider.ts imports this module, so naming it back would
    // create an import cycle.
    if (sw === SW_DENY) {
      throw new WalletError({
        code: ERROR_CODES.CONNECTION_REJECTED,
        message: "User rejected the request on the Ledger device (0x6985)",
      });
    }
    if (sw !== SW_OK) {
      const known = STATUS_WORDS[sw];
      throw new Error(`${known ?? "The device rejected the request"} ` + `(0x${sw.toString(16).padStart(4, "0")})`);
    }
    return response.data;
  };
}
