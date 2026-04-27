/**
 * Canonical `vaultContext` byte encoding per
 * `derive-vault-secrets.md` §2.3.
 *
 * ```
 * vaultContext :=
 *     I2OSP(32, 4) || depositorBtcPubkey            // 32B x-only
 *  || I2OSP(32, 4) || fundingOutpointsCommitment    // 32B SHA-256
 * ```
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
const VAULT_CONTEXT_SIZE =
  FIELD_LEN_PREFIX_SIZE +
  DEPOSITOR_PUBKEY_SIZE +
  FIELD_LEN_PREFIX_SIZE +
  COMMITMENT_SIZE;

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
 * Build the canonical `vaultContext` byte string fed into the wallet's
 * `deriveContextHash` (or a locally-implemented equivalent on the
 * app side).
 *
 * Output length is always 72 bytes.
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
