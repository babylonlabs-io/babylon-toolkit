/**
 * @module lamport/derivation
 *
 * Deterministic Lamport one-time-signature key derivation for Babylon vault
 * deposits. Pure crypto functions extracted from the vault frontend into the
 * shared SDK.
 *
 * See the vault frontend's `lamportService.ts` for the full derivation
 * documentation.
 */
import { hmac } from "@noble/hashes/hmac.js";
import { ripemd160 } from "@noble/hashes/legacy.js";
import { sha256, sha512 } from "@noble/hashes/sha2.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { mnemonicToSeedSync } from "@scure/bip39";

import { stripHexPrefix } from "../primitives/utils/bitcoin";

import type { LamportKeypair, LamportPublicKey } from "./types";

/**
 * Number of bit positions in the Lamport keypair. Corresponds to the number
 * of garbled-circuit labels used in the BitVM-style protocol (PI_1 circuit).
 */
const PI_1_BITS = 508;

/**
 * Size in bytes of each Lamport preimage (garbled-circuit label size).
 * Preimages are truncated from HMAC-SHA-512 output to this length.
 */
const GC_LABEL_SIZE = 16;

/** Size in bytes of the parent key or derived key (first half of a 64-byte seed/HMAC). */
const KEY_SIZE = 32;

/** Size in bytes of the full BIP-39 seed / HMAC-SHA-512 output. */
const SEED_SIZE = 64;

/** Size of the index buffer used in per-bit derivation (1 byte flag + 4 byte big-endian index). */
const INDEX_BUFFER_SIZE = 5;

/** Size of the big-endian length prefix prepended to variable-length fields. */
const LENGTH_PREFIX_SIZE = 4;

// ---------------------------------------------------------------------------
// Internal byte-manipulation utilities
// ---------------------------------------------------------------------------

/** Concatenate multiple `Uint8Array` buffers into a single array. */
function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/** Encode a UTF-8 string as bytes. */
function stringToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/**
 * Prepend a 4-byte big-endian length prefix to `data`.
 * Used to unambiguously concatenate variable-length fields in the vault
 * derivation path.
 */
function lengthPrefixed(data: Uint8Array): Uint8Array {
  const len = new Uint8Array(LENGTH_PREFIX_SIZE);
  new DataView(len.buffer).setUint32(0, data.length, false);
  return concatBytes(len, data);
}

// ---------------------------------------------------------------------------
// Internal cryptographic primitives (@noble/hashes wrappers)
// ---------------------------------------------------------------------------

/**
 * Compute HMAC-SHA-512.
 *
 * Uses `@noble/hashes/hmac` which accepts `Uint8Array` directly,
 * avoiding the unsafe `Uint8Array.buffer as ArrayBuffer` cast that
 * the Web Crypto API would require.
 *
 * @param key  - HMAC key bytes.
 * @param data - Message bytes.
 * @returns 64-byte HMAC digest.
 */
function hmacSha512(key: Uint8Array, data: Uint8Array): Uint8Array {
  return hmac(sha512, key, data);
}

/**
 * Compute Hash160: `RIPEMD-160(SHA-256(data))`.
 *
 * This is the same hash function used in Bitcoin for address derivation.
 *
 * @param data - Input bytes.
 * @returns 20-byte hash.
 */
function hash160(data: Uint8Array): Uint8Array {
  return ripemd160(sha256(data));
}

/** Convert a byte array to a lowercase hex string. */
const toHex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

// ---------------------------------------------------------------------------
// Seed and keypair derivation
// ---------------------------------------------------------------------------

/**
 * Convert a BIP-39 mnemonic into a 64-byte seed.
 *
 * Internally uses PBKDF2 with 2048 rounds of HMAC-SHA-512 and the passphrase
 * `"mnemonic"` (no user password), per the BIP-39 specification.
 *
 * @param mnemonic - A valid 12-word BIP-39 mnemonic.
 * @returns 64-byte seed suitable for {@link deriveLamportKeypair}.
 */
export function mnemonicToLamportSeed(mnemonic: string): Uint8Array {
  const seed = mnemonicToSeedSync(mnemonic);
  return new Uint8Array(seed);
}

/**
 * Derive a deterministic Lamport keypair for a specific vault.
 *
 * ### Derivation steps
 *
 * 1. **Split the seed** — bytes `[0..32)` = parent key, `[32..64)` = chain code.
 *
 * 2. **Child key derivation** —
 *    ```
 *    vaultData = lenPrefix(vaultId) || lenPrefix(depositorPk) || lenPrefix(appContractAddress)
 *    hmac      = HMAC-SHA-512(chainCode, parentKey || vaultData)
 *    derivedKey       = hmac[0..32)
 *    derivedChainCode = hmac[32..64)
 *    ```
 *
 * 3. **Bit-level key expansion** — For each bit index `i` in `[0, 508)`:
 *    ```
 *    falseHmac = HMAC-SHA-512(derivedChainCode, derivedKey || 0x00 || bigEndian32(i))
 *    trueHmac  = HMAC-SHA-512(derivedChainCode, derivedKey || 0x01 || bigEndian32(i))
 *
 *    falsePreimage = falseHmac[0..16)     // 16 bytes = GC_LABEL_SIZE
 *    truePreimage  = trueHmac[0..16)
 *
 *    falseHash = Hash160(falsePreimage)    // 20 bytes
 *    trueHash  = Hash160(truePreimage)
 *    ```
 *
 * 4. **Cleanup** — All intermediate key material is zeroed.
 *
 * The same (mnemonic, vaultId, depositorPk, appContractAddress) tuple always
 * produces the same keypair, enabling recovery from the mnemonic alone.
 *
 * @param seed               - 64-byte seed from {@link mnemonicToLamportSeed}.
 * @param vaultId            - Unique identifier of the vault (e.g. pegin tx hash).
 * @param depositorPk        - Depositor's public key (hex string).
 * @param appContractAddress - Ethereum address of the application contract.
 * @returns A {@link LamportKeypair} with 508 preimage/hash pairs per branch.
 */
export async function deriveLamportKeypair(
  seed: Uint8Array,
  vaultId: string,
  depositorPk: string,
  appContractAddress: string,
): Promise<LamportKeypair> {
  if (seed.length !== SEED_SIZE) {
    throw new Error(
      `Lamport seed must be ${SEED_SIZE} bytes, got ${seed.length}`,
    );
  }

  // Normalize BTC-style inputs by stripping 0x prefixes.
  // appContractAddress is NOT stripped — Ethereum addresses include the 0x
  // prefix in their canonical form, and existing on-chain commitments were
  // computed with it included. Changing this would break hash determinism.
  vaultId = stripHexPrefix(vaultId);
  depositorPk = stripHexPrefix(depositorPk);

  const chainCode = seed.slice(KEY_SIZE, SEED_SIZE);
  const parentKey = seed.slice(0, KEY_SIZE);

  // Track all intermediate buffers containing key material for cleanup.
  const sensitiveBuffers: Uint8Array[] = [chainCode, parentKey];

  try {
    const vaultData = concatBytes(
      lengthPrefixed(stringToBytes(vaultId)),
      lengthPrefixed(stringToBytes(depositorPk)),
      lengthPrefixed(stringToBytes(appContractAddress)),
    );

    const hmacInput = concatBytes(parentKey, vaultData);
    sensitiveBuffers.push(hmacInput);

    const hmacResult = hmacSha512(chainCode, hmacInput);
    sensitiveBuffers.push(hmacResult);

    const derivedKey = hmacResult.slice(0, KEY_SIZE);
    const derivedChainCode = hmacResult.slice(KEY_SIZE, SEED_SIZE);
    sensitiveBuffers.push(derivedKey, derivedChainCode);

    const falsePreimages: Uint8Array[] = [];
    const truePreimages: Uint8Array[] = [];
    const falseHashes: Uint8Array[] = [];
    const trueHashes: Uint8Array[] = [];

    let succeeded = false;
    try {
      for (let bit = 0; bit < PI_1_BITS; bit++) {
        const falseIndex = new Uint8Array(INDEX_BUFFER_SIZE);
        falseIndex[0] = 0;
        new DataView(falseIndex.buffer).setUint32(1, bit, false);

        const trueIndex = new Uint8Array(INDEX_BUFFER_SIZE);
        trueIndex[0] = 1;
        new DataView(trueIndex.buffer).setUint32(1, bit, false);

        const falseInput = concatBytes(derivedKey, falseIndex);
        const trueInput = concatBytes(derivedKey, trueIndex);
        const falseHmac = hmacSha512(derivedChainCode, falseInput);
        const trueHmac = hmacSha512(derivedChainCode, trueInput);

        try {
          const falsePreimage = falseHmac.slice(0, GC_LABEL_SIZE);
          const truePreimage = trueHmac.slice(0, GC_LABEL_SIZE);

          falsePreimages.push(falsePreimage);
          truePreimages.push(truePreimage);
          falseHashes.push(hash160(falsePreimage));
          trueHashes.push(hash160(truePreimage));
        } finally {
          falseInput.fill(0);
          trueInput.fill(0);
          falseHmac.fill(0);
          trueHmac.fill(0);
        }
      }

      succeeded = true;
      return { falsePreimages, truePreimages, falseHashes, trueHashes };
    } finally {
      if (!succeeded) {
        for (const p of falsePreimages) p.fill(0);
        for (const p of truePreimages) p.fill(0);
      }
    }
  } finally {
    for (const buf of sensitiveBuffers) {
      buf.fill(0);
    }
  }
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

/**
 * Extract the public key from a Lamport keypair.
 *
 * The public key consists of the Hash160 digests (hex-encoded) for both
 * the `false` and `true` branch of each bit position. This is the value
 * submitted on-chain and to the vault provider for later signature
 * verification.
 *
 * @param keypair - A derived {@link LamportKeypair}.
 * @returns The {@link LamportPublicKey} with `false_list` and `true_list`,
 *          each containing 508 hex strings of 40 characters (20 bytes).
 */
export function keypairToPublicKey(keypair: LamportKeypair): LamportPublicKey {
  return {
    false_list: keypair.falseHashes.map(toHex),
    true_list: keypair.trueHashes.map(toHex),
  };
}

/**
 * Compute the keccak256 hash of a Lamport keypair's public key.
 *
 * Matches the Rust `InputLabelHashes::keccak256_hash()` implementation:
 * `keccak256(falseHashes[0] || falseHashes[1] || ... || trueHashes[0] || trueHashes[1] || ...)`
 *
 * Each hash is 20 bytes (Hash160). Total input: `PI_1_BITS * 20 * 2` bytes.
 * The result is committed on-chain as `depositorLamportPkHash` so the vault
 * provider can later verify submitted Lamport public keys.
 *
 * @param keypair - A derived {@link LamportKeypair}.
 * @returns 32-byte keccak256 digest as a `0x`-prefixed hex string.
 */
export function computeLamportPkHash(keypair: LamportKeypair): `0x${string}` {
  if (keypair.falseHashes.length === 0 || keypair.trueHashes.length === 0) {
    throw new Error(
      "computeLamportPkHash: keypair hash arrays must not be empty",
    );
  }
  const hashSize = keypair.falseHashes[0].length;
  const totalBytes =
    (keypair.falseHashes.length + keypair.trueHashes.length) * hashSize;
  const buffer = new Uint8Array(totalBytes);

  let offset = 0;
  for (const h of keypair.falseHashes) {
    buffer.set(h, offset);
    offset += hashSize;
  }
  for (const h of keypair.trueHashes) {
    buffer.set(h, offset);
    offset += hashSize;
  }

  const digest = keccak_256(buffer);
  return `0x${toHex(digest)}`;
}
