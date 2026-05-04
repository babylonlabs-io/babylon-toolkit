/**
 * Canonical context byte encodings fed into the wallet's
 * `deriveContextHash` for per-purpose vault-secret derivations.
 *
 * Two shapes:
 *
 * - **Per-Pre-PegIn** (used by `deriveAuthAnchor`):
 *   ```
 *   vaultContext :=
 *       I2OSP(32, 4) || depositorBtcPubkey            // 32B x-only
 *    || I2OSP(32, 4) || fundingOutpointsCommitment    // 32B SHA-256
 *   ```
 *
 * - **Per BTC vault** (used by `deriveHashlockSecret`, `deriveWotsSeed`):
 *   the per-Pre-PegIn bytes above, suffixed with the HTLC vout:
 *   ```
 *   perVaultContext := vaultContext || I2OSP(htlcVout, 4)
 *   ```
 *
 * `fundingOutpointsCommitment` is SHA-256 over the canonically-sorted
 * funding outpoints of the Pre-PegIn transaction, serialized as
 * `txid (32B display/RPC order) || vout (4B u32 big-endian)` per
 * outpoint. Sorting by 36-byte lex order makes the commitment
 * invariant under tx-level input reordering, so same-inputs RBF and
 * reorg rebroadcasts yield the same context.
 *
 * @module vault-secrets/context
 */

import { sha256 } from "@noble/hashes/sha2.js";

const DEPOSITOR_PUBKEY_SIZE = 32;
const TXID_SIZE = 32;
const OUTPOINT_SIZE = 36;
const COMMITMENT_SIZE = 32;
const FIELD_LEN_PREFIX_SIZE = 4;
const HTLC_VOUT_SIZE = 4;
const VAULT_CONTEXT_SIZE =
  FIELD_LEN_PREFIX_SIZE +
  DEPOSITOR_PUBKEY_SIZE +
  FIELD_LEN_PREFIX_SIZE +
  COMMITMENT_SIZE;
const PER_VAULT_CONTEXT_SIZE = VAULT_CONTEXT_SIZE + HTLC_VOUT_SIZE;

export interface FundingOutpoint {
  /**
   * Bitcoin txid in **display / RPC order** (byte-reversed from the
   * internal little-endian wire form used when hashing a raw tx).
   */
  txid: Uint8Array;
  /** Output index within the referenced transaction (u32). */
  vout: number;
}

export interface VaultContextInput {
  /** Depositor's x-only BTC public key (32 bytes). */
  depositorBtcPubkey: Uint8Array;
  /** Funding outpoints of the Pre-PegIn transaction. MUST be non-empty. */
  fundingOutpoints: readonly FundingOutpoint[];
}

function writeUint32BE(out: Uint8Array, offset: number, value: number): void {
  out[offset] = (value >>> 24) & 0xff;
  out[offset + 1] = (value >>> 16) & 0xff;
  out[offset + 2] = (value >>> 8) & 0xff;
  out[offset + 3] = value & 0xff;
}

function serializeOutpoint(outpoint: FundingOutpoint): Uint8Array {
  if (outpoint.txid.length !== TXID_SIZE) {
    throw new Error(
      `outpoint.txid must be exactly ${TXID_SIZE} bytes, got ${outpoint.txid.length}`,
    );
  }
  if (
    !Number.isInteger(outpoint.vout) ||
    outpoint.vout < 0 ||
    outpoint.vout > 0xffffffff
  ) {
    throw new Error(`outpoint.vout must be a u32, got ${outpoint.vout}`);
  }
  const out = new Uint8Array(OUTPOINT_SIZE);
  out.set(outpoint.txid, 0);
  writeUint32BE(out, TXID_SIZE, outpoint.vout);
  return out;
}

function compareBytes(a: Uint8Array, b: Uint8Array): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

/**
 * Compute SHA-256 over canonically-sorted funding outpoints.
 *
 * Outpoints are serialized as 36-byte `txid || vout_BE`, sorted
 * ascending lexicographically, concatenated, then hashed.
 *
 * @stability frozen — on-chain-binding. Any change to layout, sort
 * order, or serialization is a hard fork; existing deposits would no
 * longer match their committed `depositorWotsPkHash`.
 *
 * @throws If `outpoints` is empty or contains duplicates.
 */
export function buildFundingOutpointsCommitment(
  outpoints: readonly FundingOutpoint[],
): Uint8Array {
  if (outpoints.length === 0) {
    throw new Error(
      "buildFundingOutpointsCommitment: outpoints must be non-empty",
    );
  }
  const serialized = outpoints.map(serializeOutpoint);
  serialized.sort(compareBytes);

  for (let i = 1; i < serialized.length; i++) {
    if (compareBytes(serialized[i - 1], serialized[i]) === 0) {
      throw new Error(
        "buildFundingOutpointsCommitment: duplicate outpoint detected",
      );
    }
  }

  const flat = new Uint8Array(serialized.length * OUTPOINT_SIZE);
  for (let i = 0; i < serialized.length; i++) {
    flat.set(serialized[i], i * OUTPOINT_SIZE);
  }
  return sha256(flat);
}

/**
 * Build the per-Pre-PegIn `vaultContext` byte string fed into the
 * wallet's `deriveContextHash` for derivations that are shared across
 * every BTC vault funded by the same Pre-PegIn (currently:
 * `deriveAuthAnchor`).
 *
 * Output length is always 72 bytes.
 *
 * @stability frozen — on-chain-binding. The 72-byte layout is the
 * input to `deriveContextHash`; any change rotates the auth anchor and
 * invalidates the OP_RETURN commitment for existing Pre-PegIns.
 */
export function buildVaultContext(input: VaultContextInput): Uint8Array {
  if (input.depositorBtcPubkey.length !== DEPOSITOR_PUBKEY_SIZE) {
    throw new Error(
      `vaultContext: depositorBtcPubkey must be exactly ${DEPOSITOR_PUBKEY_SIZE} bytes, got ${input.depositorBtcPubkey.length}`,
    );
  }
  const commitment = buildFundingOutpointsCommitment(input.fundingOutpoints);

  const out = new Uint8Array(VAULT_CONTEXT_SIZE);
  let offset = 0;

  writeUint32BE(out, offset, DEPOSITOR_PUBKEY_SIZE);
  offset += FIELD_LEN_PREFIX_SIZE;
  out.set(input.depositorBtcPubkey, offset);
  offset += DEPOSITOR_PUBKEY_SIZE;

  writeUint32BE(out, offset, COMMITMENT_SIZE);
  offset += FIELD_LEN_PREFIX_SIZE;
  out.set(commitment, offset);

  return out;
}

/**
 * Build the per-BTC-vault context — `vaultContext` suffixed with the
 * HTLC output index encoded as 4 bytes big-endian. Used by
 * `deriveHashlockSecret` and `deriveWotsSeed` to derive a distinct
 * secret per vault while sharing the same Pre-PegIn-level context.
 *
 * Output length is always 76 bytes.
 *
 * @stability frozen — on-chain-binding for hashlock and WOTS secrets.
 * Changing the layout (including the htlcVout encoding) rotates every
 * derived per-vault secret.
 */
export function buildPerVaultContext(
  input: VaultContextInput,
  htlcVout: number,
): Uint8Array {
  if (
    !Number.isInteger(htlcVout) ||
    htlcVout < 0 ||
    htlcVout > 0xffffffff
  ) {
    throw new Error(`perVaultContext: htlcVout must be a u32, got ${htlcVout}`);
  }
  const base = buildVaultContext(input);
  const out = new Uint8Array(PER_VAULT_CONTEXT_SIZE);
  out.set(base, 0);
  writeUint32BE(out, VAULT_CONTEXT_SIZE, htlcVout);
  return out;
}
