/**
 * The two APDU instructions the vault app adds over the Bitcoin base app,
 * and the ceremony that sequences them. Everything else — notably SIGN_PSBT —
 * falls through to the base app. Framing verified against Ledger's reference
 * client (`tests/vault_client.py`).
 *
 * @module ledger-vault-signer/vaultCommands
 */

import {
  MAX_APDU_DATA_BYTES,
  encodeIntentGroup,
  encodeIntentScalars,
  encodeKeyBatches,
  type IntentScalars,
  type IntentVaultGroup,
} from "./intentTlv";
import type { Apdu } from "./rawApdu";

/**
 * The ONE class byte for the whole app: the base app's dispatcher gates every
 * instruction — GET_EXTENDED_PUBKEY and the vault's 0x80/0x81 alike — on this
 * CLA (`apdu_handler.c:19`). derivation.ts imports it for the base-app read.
 */
export const CLA_APP = 0xe1;
const INS_APPROVE_VAULT_INTENT = 0x80;
const INS_DERIVE_CONTEXT_HASH = 0x81;

/** DERIVE_CONTEXT_HASH P1. */
const P1_INITIAL = 0x00;
const P1_CONTINUE = 0x01;

/** APPROVE_VAULT_INTENT P1 phases, in the order the device requires. */
const P1_SCALARS = 0x00;
const P1_GROUP = 0x01;
const P1_KEY_BATCH = 0x02;

/**
 * P2=0x00 shows the approval screen and returns the root; P2=0x01 derives
 * silently. We always use 0x00: a silently-derived root sets
 * `root_user_approved = false` and can never load an intent, so the ceremony
 * would fail later with an opaque status word.
 */
const P2_SHOW = 0x00;

const APP_NAME_MAX_BYTES = 64;
const CONTEXT_MAX_BYTES = 1024;
const DERIVATION_PATH_MAX_LEVELS = 10;
const ROOT_BYTES = 32;

/** Transport seam: send one APDU, return the response data or throw on error SW. */
export type ApduSender = (apdu: Apdu) => Promise<Uint8Array>;

function u16BE(value: number): Uint8Array {
  return new Uint8Array([(value >> 8) & 0xff, value & 0xff]);
}

function u32BE(value: number): Uint8Array {
  const v = value >>> 0;
  return new Uint8Array([(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/** The device accepts only `[a-z0-9-]` in the app name. */
const APP_NAME_PATTERN = /^[a-z0-9-]+$/;

export interface DeriveContextHashParams {
  appName: string;
  /** 1..10 levels; distinct from the intent's fixed 5-level depositor path. */
  derivationPath: readonly number[];
  context: Uint8Array;
}

/**
 * Derive the context root, showing the approval screen. Streaming is
 * implicit — no last-chunk flag; the declared byte count is the only signal.
 *
 * @returns the 32-byte root
 * @throws If the inputs exceed the device's documented limits
 */
export async function deriveContextHash(
  send: ApduSender,
  { appName, derivationPath, context }: DeriveContextHashParams,
): Promise<Uint8Array> {
  const nameBytes = new TextEncoder().encode(appName);
  if (nameBytes.length < 1 || nameBytes.length > APP_NAME_MAX_BYTES) {
    throw new Error(`appName must be 1..${APP_NAME_MAX_BYTES} bytes, got ${nameBytes.length}`);
  }
  if (!APP_NAME_PATTERN.test(appName)) {
    throw new Error(`appName must match ${APP_NAME_PATTERN} — the device rejects other characters`);
  }
  if (derivationPath.length < 1 || derivationPath.length > DERIVATION_PATH_MAX_LEVELS) {
    throw new Error(`derivationPath must have 1..${DERIVATION_PATH_MAX_LEVELS} levels`);
  }
  if (context.length < 1 || context.length > CONTEXT_MAX_BYTES) {
    throw new Error(`context must be 1..${CONTEXT_MAX_BYTES} bytes, got ${context.length}`);
  }

  const header = concat([
    new Uint8Array([nameBytes.length]),
    nameBytes,
    new Uint8Array([derivationPath.length]),
    concat(derivationPath.map(u32BE)),
    u16BE(context.length),
  ]);

  const firstChunkLen = Math.min(context.length, MAX_APDU_DATA_BYTES - header.length);
  if (firstChunkLen < 0) {
    throw new Error("appName and derivationPath leave no room for context in the first APDU");
  }

  let response = await send({
    cla: CLA_APP,
    ins: INS_DERIVE_CONTEXT_HASH,
    p1: P1_INITIAL,
    p2: P2_SHOW,
    data: concat([header, context.subarray(0, firstChunkLen)]),
  });

  for (let sent = firstChunkLen; sent < context.length; sent += MAX_APDU_DATA_BYTES) {
    response = await send({
      cla: CLA_APP,
      ins: INS_DERIVE_CONTEXT_HASH,
      p1: P1_CONTINUE,
      p2: P2_SHOW,
      data: context.subarray(sent, sent + MAX_APDU_DATA_BYTES),
    });
  }

  if (response.length !== ROOT_BYTES) {
    throw new Error(`Expected a ${ROOT_BYTES}-byte context root, got ${response.length} bytes`);
  }
  return response;
}

export interface ApproveVaultIntentParams {
  scalars: IntentScalars;
  groups: readonly IntentVaultGroup[];
  keeperPubkeys: readonly Uint8Array[];
  challengerPubkeys: readonly Uint8Array[];
}

/**
 * Load and approve a vault intent. The device enforces the phase order —
 * scalars (P1=0x00), groups (P1=0x01), keys (P1=0x02) — and requires a
 * completed {@link deriveContextHash} first; violations return SW_BAD_STATE.
 *
 * @throws If the declared counts disagree with the supplied data
 */
export async function approveVaultIntent(
  send: ApduSender,
  { scalars, groups, keeperPubkeys, challengerPubkeys }: ApproveVaultIntentParams,
): Promise<void> {
  // The device cross-checks these against what actually arrives, and a
  // mismatch surfaces as an opaque status word mid-ceremony.
  if (groups.length !== scalars.vaultCount) {
    throw new Error(`vaultCount ${scalars.vaultCount} does not match ${groups.length} group(s)`);
  }
  if (keeperPubkeys.length !== scalars.keeperCount) {
    throw new Error(`keeperCount ${scalars.keeperCount} does not match ${keeperPubkeys.length} key(s)`);
  }
  // With an empty roster no key APDU is sent, so we would resolve "approved"
  // while the device approved nothing (approval happens in the key handler).
  if (scalars.keeperCount < 1 || scalars.challengerCount < 1) {
    throw new Error(
      `Both rosters must be non-empty: keeperCount=${scalars.keeperCount}, ` +
        `challengerCount=${scalars.challengerCount}`,
    );
  }
  if (challengerPubkeys.length !== scalars.challengerCount) {
    throw new Error(`challengerCount ${scalars.challengerCount} does not match ${challengerPubkeys.length} key(s)`);
  }

  await send({
    cla: CLA_APP,
    ins: INS_APPROVE_VAULT_INTENT,
    p1: P1_SCALARS,
    p2: P2_SHOW,
    data: encodeIntentScalars(scalars),
  });

  for (const group of groups) {
    await send({
      cla: CLA_APP,
      ins: INS_APPROVE_VAULT_INTENT,
      p1: P1_GROUP,
      p2: P2_SHOW,
      data: encodeIntentGroup(group),
    });
  }

  for (const batch of encodeKeyBatches(keeperPubkeys, challengerPubkeys)) {
    await send({
      cla: CLA_APP,
      ins: INS_APPROVE_VAULT_INTENT,
      p1: P1_KEY_BATCH,
      p2: P2_SHOW,
      data: batch,
    });
  }
}
