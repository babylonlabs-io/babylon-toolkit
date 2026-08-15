/**
 * Binds our APDU seams to DMK's public raw-APDU transport. Two senders share
 * one wire encoding: the non-throwing {@link RawApduSender} for the SIGN_PSBT
 * interrupt/continue loop (#2219, where 0xE000 is data), and the throwing
 * {@link ApduSender} the DERIVE/APPROVE ceremony rides, re-based on the raw
 * sender via `classifyStatusWord`. Debugging:
 * `globalThis.__LEDGER_VAULT_APDU_TRACE__ = true` logs header + status word
 * per exchange — never payload bytes (pubkeys, context preimage).
 *
 * @module ledger-vault-signer/dmkApduSender
 */

import type { DmkSessionHandle } from "./dmkSession";
import { classifyStatusWord, hex2, hex4, type Apdu, type RawApduSender } from "./rawApdu";
import type { ApduSender } from "./vaultCommands";

const STATUS_WORD_BYTES = 2;

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

/**
 * Uint8Array assignment truncates mod-256 while the trace prints the full
 * value — reject an out-of-range header field instead of diverging.
 */
function assertByte(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new Error(`APDU ${name} ${value} is not a single byte (0..255)`);
  }
}

/** Serialise to the wire form: CLA ‖ INS ‖ P1 ‖ P2 ‖ Lc ‖ DATA. */
function encodeApdu(apdu: Apdu): Uint8Array {
  assertByte(apdu.cla, "cla");
  assertByte(apdu.ins, "ins");
  assertByte(apdu.p1, "p1");
  assertByte(apdu.p2, "p2");
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

/**
 * Build a non-throwing sender bound to one device session: every status word
 * — 0xE000 included — comes back as data. A `sessionId` must never outlive
 * its connection — recreate the sender whenever the session changes.
 */
export function createDmkRawApduSender(handle: DmkSessionHandle): RawApduSender {
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
    return { sw, data: response.data };
  };
}

/**
 * Build the ceremony's throwing sender: the raw sender plus the shared
 * status-word classification (typed error on anything but 0x9000).
 */
export function createDmkApduSender(handle: DmkSessionHandle): ApduSender {
  const sendRaw = createDmkRawApduSender(handle);
  return async (apdu) => {
    const { sw, data } = await sendRaw(apdu);
    const error = classifyStatusWord(sw, {
      ins: apdu.ins,
      p1: apdu.p1,
      appName: handle.appName,
      appVersion: handle.appVersion,
    });
    if (error) throw error;
    return data;
  };
}
