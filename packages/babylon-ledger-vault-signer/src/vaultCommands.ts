/**
 * The three APDU instructions the vault app adds over the Bitcoin base app,
 * and the ceremony that sequences them. Everything else — notably SIGN_PSBT —
 * falls through to the base app. Framing verified against Ledger's reference
 * client (`derive_context_hash`, `approve_vault_intent` and `get_vault_state`
 * in `tests/vault_client.py`; the TLV payloads come from `build_intent_tlv`
 * and `build_group_tlv`) and `docs/apdu.md`.
 *
 * @module ledger-vault-signer/vaultCommands
 */

import { crypto as bcrypto } from "bitcoinjs-lib";
import { Buffer } from "buffer";

import { assertU32Levels } from "./bip86Path";
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
 * instruction — GET_EXTENDED_PUBKEY and the vault's 0x80-0x82 alike — on this
 * CLA. derivation.ts imports it for the base-app read.
 */
export const CLA_APP = 0xe1;
const INS_APPROVE_VAULT_INTENT = 0x80;
const INS_DERIVE_CONTEXT_HASH = 0x81;
const INS_GET_VAULT_STATE = 0x82;

/** DERIVE_CONTEXT_HASH P1. */
const P1_INITIAL = 0x00;
const P1_CONTINUE = 0x01;

/** APPROVE_VAULT_INTENT P1 phases, in the order the device requires. */
const P1_SCALARS = 0x00;
const P1_GROUP = 0x01;
const P1_KEY_BATCH = 0x02;

/**
 * P2=0x00 shows the approval screen and returns the root; P2=0x01 skips the
 * screen and returns no root. The host needs the root to expand per-vault
 * secrets, so we always send 0x00.
 */
const P2_SHOW = 0x00;

const APP_NAME_MAX_BYTES = 64;
const CONTEXT_MAX_BYTES = 1024;
const DERIVATION_PATH_MAX_LEVELS = 10;
const ROOT_BYTES = 32;

/** GET_VAULT_STATE takes P1 = P2 = 0x00 and no data. */
const P1_NONE = 0x00;
const P2_NONE = 0x00;
/** A fingerprint is the last 4 bytes of a SHA-256 digest. */
const VAULT_FINGERPRINT_BYTES = 4;
const SHA256_BYTES = 32;
/** One length byte per fingerprint, then the fingerprint when that byte is non-zero. */
const STATE_LENGTH_BYTE = 1;

/** Transport seam: send one APDU, return the response data or throw on error SW. */
export type ApduSender = (apdu: Apdu) => Promise<Uint8Array>;

function u16BE(value: number): Uint8Array {
  return new Uint8Array([(value >> 8) & 0xff, value & 0xff]);
}

function u32BE(value: number): Uint8Array {
  return new Uint8Array([(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]);
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
  assertU32Levels("derivationPath", derivationPath);
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

/** Last {@link VAULT_FINGERPRINT_BYTES} bytes of SHA-256 over the concatenation of `parts`. */
function fingerprint(parts: readonly Uint8Array[]): Uint8Array {
  return Uint8Array.from(bcrypto.sha256(Buffer.from(concat([...parts]))).subarray(SHA256_BYTES - VAULT_FINGERPRINT_BYTES));
}

/** The CData of every APPROVE_VAULT_INTENT APDU, in the order {@link approveVaultIntent} sends them. */
function encodeIntentApdus({ scalars, groups, keeperPubkeys, challengerPubkeys }: ApproveVaultIntentParams): {
  readonly scalars: Uint8Array;
  readonly groups: Uint8Array[];
  readonly keyBatches: Uint8Array[];
} {
  return {
    scalars: encodeIntentScalars(scalars),
    groups: groups.map(encodeIntentGroup),
    keyBatches: encodeKeyBatches(keeperPubkeys, challengerPubkeys),
  };
}

/**
 * The fingerprint GET_VAULT_STATE reports once this intent is approved:
 * last 4 bytes of SHA-256 over the CData of every APDU {@link approveVaultIntent}
 * sends, in order (`docs/apdu.md`, fingerprint definitions). Pure, no I/O.
 */
export function intentFingerprint(params: ApproveVaultIntentParams): Uint8Array {
  const apdus = encodeIntentApdus(params);
  return fingerprint([apdus.scalars, ...apdus.groups, ...apdus.keyBatches]);
}

/**
 * Load and approve a vault intent. The device enforces the phase order —
 * scalars (P1=0x00), groups (P1=0x01), keys (P1=0x02) — and requires a
 * completed {@link deriveContextHash} first; violations return SW_BAD_STATE.
 *
 * @throws If the declared counts disagree with the supplied data
 */
export async function approveVaultIntent(send: ApduSender, params: ApproveVaultIntentParams): Promise<void> {
  const { scalars, groups, keeperPubkeys, challengerPubkeys } = params;
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

  // One encoder for the ceremony and for intentFingerprint, so the device's
  // fingerprint of what was sent is reproducible from the same terms.
  const apdus = encodeIntentApdus(params);
  await send({ cla: CLA_APP, ins: INS_APPROVE_VAULT_INTENT, p1: P1_SCALARS, p2: P2_SHOW, data: apdus.scalars });
  for (const group of apdus.groups) {
    await send({ cla: CLA_APP, ins: INS_APPROVE_VAULT_INTENT, p1: P1_GROUP, p2: P2_SHOW, data: group });
  }
  for (const batch of apdus.keyBatches) {
    await send({ cla: CLA_APP, ins: INS_APPROVE_VAULT_INTENT, p1: P1_KEY_BATCH, p2: P2_SHOW, data: batch });
  }
}

/**
 * What the device's vault session holds (`docs/apdu.md`, INS 0x82): nothing,
 * a derived context root, or an approved intent over that root.
 */
export type VaultSessionState =
  | { readonly phase: "idle" }
  | { readonly phase: "hash-derived"; readonly contextFingerprint: Uint8Array }
  | { readonly phase: "intent-loaded"; readonly intentFingerprint: Uint8Array; readonly contextFingerprint: Uint8Array };

/** Read one `len ‖ fingerprint` field at `offset`; `undefined` when the length byte is 0. */
function readFingerprintField(
  response: Uint8Array,
  offset: number,
): { fingerprint: Uint8Array | undefined; next: number } {
  if (offset >= response.length) throw new Error("GET_VAULT_STATE response is truncated");
  const length = response[offset];
  const start = offset + STATE_LENGTH_BYTE;
  if (length === 0) return { fingerprint: undefined, next: start };
  if (length !== VAULT_FINGERPRINT_BYTES) {
    throw new Error(`GET_VAULT_STATE fingerprint length must be 0 or ${VAULT_FINGERPRINT_BYTES}, got ${length}`);
  }
  if (start + length > response.length) throw new Error("GET_VAULT_STATE response is truncated");
  return { fingerprint: response.slice(start, start + length), next: start + length };
}

/**
 * Silent, read-only query of the device's vault session (ADR-001). No screen,
 * no state change; any host may call it.
 *
 * @throws If the response is not one of the three encodings the device sends
 */
export async function getVaultState(send: ApduSender): Promise<VaultSessionState> {
  const response = await send({
    cla: CLA_APP,
    ins: INS_GET_VAULT_STATE,
    p1: P1_NONE,
    p2: P2_NONE,
    data: new Uint8Array(0),
  });
  const intent = readFingerprintField(response, 0);
  const context = readFingerprintField(response, intent.next);
  if (context.next !== response.length) throw new Error("GET_VAULT_STATE response has trailing bytes");
  if (intent.fingerprint === undefined && context.fingerprint === undefined) return { phase: "idle" };
  if (intent.fingerprint === undefined && context.fingerprint !== undefined) {
    return { phase: "hash-derived", contextFingerprint: context.fingerprint };
  }
  if (intent.fingerprint !== undefined && context.fingerprint !== undefined) {
    return { phase: "intent-loaded", intentFingerprint: intent.fingerprint, contextFingerprint: context.fingerprint };
  }
  // The device reports the context fingerprint whenever it reports an intent,
  // so an intent alone is not a device answer.
  throw new Error("GET_VAULT_STATE reported an intent without a context root");
}
