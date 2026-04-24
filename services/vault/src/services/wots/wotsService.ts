/**
 * @module wotsService
 *
 * Deterministic WOTS (Winternitz One-Time Signature) key derivation for
 * Babylon vault deposits. Each depositor generates a BIP-39 mnemonic that
 * seeds a hierarchical derivation tree, producing WOTS block public keys
 * per vault matching the Rust `babe::wots` implementation.
 *
 * ## High-level flow
 *
 * 1. **Mnemonic generation** — A standard 12-word BIP-39 mnemonic (128 bits
 *    of entropy) is generated using the English wordlist from `@scure/bip39`.
 *
 * 2. **Seed derivation** — The mnemonic is converted to a 64-byte BIP-39
 *    seed via PBKDF2 (2048 rounds of HMAC-SHA-512, per the BIP-39 spec).
 *    The first 32 bytes become the *parent key* and the last 32 bytes become
 *    the *chain code*, following a structure inspired by BIP-32.
 *
 * 3. **Per-vault child derivation** — A vault-specific child key is derived
 *    by computing `HMAC-SHA-512(chainCode, parentKey || vaultData)` where
 *    `vaultData` is the length-prefixed concatenation of the vault ID,
 *    depositor public key, and application contract address.
 *
 * 4. **WOTS block key generation** — Two assert blocks are generated
 *    (matching `ASSERT_WOTS_BLOCK_DIGIT_COUNTS = [64, 64]`), each with
 *    64 message digits at 4 bits per digit plus 2 checksum digits.
 *    For each block a 20-byte seed is derived, then Hash160 chains are
 *    computed per the Rust `babe::wots::SecretKey::from_seed` algorithm.
 *    The public key consists of the terminal chain values.
 *
 * 5. **Serialization** — Public keys are serialized in the format expected
 *    by the vault provider's `vaultProvider_submitDepositorWotsKey` RPC,
 *    matching Rust `serde_json` of `Vec<babe::wots::PublicKey>`.
 *
 * ## Security considerations
 *
 * - Sensitive key material (parent key, chain code, HMAC outputs, block
 *   seeds) is zeroed after use to limit exposure in memory. Intermediate
 *   chain values (hash steps toward public terminals) are not zeroed as
 *   they are not secret — only the chain starts (derived from the zeroed
 *   block seed) carry entropy.
 * - Only public key terminals are returned; secret chain starts stay local.
 *
 * ## Note: intentional TS-only implementation
 *
 * This TypeScript WOTS implementation mirrors the Rust `babe::wots` crate's
 * cryptographic primitives (Hash160 chains, checksum digits, public key
 * serialization) but the derivation path is fundamentally different:
 *
 * - **Rust (VP-side):** generates WOTS keypairs from pure random entropy
 *   via `WotsBigBlockKeypairs::generate()`. No mnemonic, no seed hierarchy.
 * - **TypeScript (depositor-side):** derives WOTS keys deterministically from
 *   a BIP-39 mnemonic → HMAC-based child derivation → per-block seeds, so the
 *   depositor can re-derive keys from their mnemonic backup.
 *
 * The mnemonic/seed hierarchy is wallet-layer logic that does not belong in
 * Rust/WASM. Only the low-level chain computation (`from_seed`, `hash160`,
 * checksum) is duplicated, and this is acceptable because:
 *   1. The logic is simple and well-tested against Rust reference vectors.
 *   2. Exposing it via WASM would require passing the depositor's secret seed
 *      material across the JS↔WASM boundary with no security benefit.
 */
import type {
  WotsBlockPublicKey,
  WotsConfig,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { hmac } from "@noble/hashes/hmac.js";
import { ripemd160 } from "@noble/hashes/legacy.js";
import { sha256, sha512 } from "@noble/hashes/sha2.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import {
  generateMnemonic,
  mnemonicToSeedSync,
  validateMnemonic,
} from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

import { stripHexPrefix } from "@/utils/btc";

export type { WotsBlockPublicKey, WotsConfig };

/** Bits of entropy for BIP-39 mnemonic generation (128 = 12 words). */
const MNEMONIC_ENTROPY_BITS = 128;

/** Size in bytes of the parent key or derived key (first half of a 64-byte seed/HMAC). */
const KEY_SIZE = 32;

/** Size in bytes of the full BIP-39 seed / HMAC-SHA-512 output. */
const SEED_SIZE = 64;

/** Size of the big-endian length prefix prepended to variable-length fields. */
const LENGTH_PREFIX_SIZE = 4;

// ---------------------------------------------------------------------------
// WOTS protocol constants — must match btc-vault / babe::wots
// ---------------------------------------------------------------------------

/** Hash160 output size in bytes (= RIPEMD-160(SHA-256(·))). */
const CHAIN_ELEMENT_SIZE = 20;

/** Bits per WOTS digit. Matches `babe::WOTS_DIGIT_BITS`. */
const WOTS_DIGIT_BITS = 4;

/** Number of checksum digits in canonical WOTS ordering. */
const WOTS_CHECKSUM_DIGITS = 2;

/** Digit index for the checksum minor chain (canonical ordering). */
const CHECKSUM_MINOR_DIGIT_INDEX = 0;

/** Digit index for the checksum major chain (canonical ordering). */
const CHECKSUM_MAJOR_DIGIT_INDEX = 1;

/**
 * Message digit counts per assert block.
 * Matches `btc_vault::ASSERT_WOTS_BLOCK_DIGIT_COUNTS`.
 * Two blocks of 64 message digits each (4 bits/digit → 256 bits capacity).
 */
const ASSERT_WOTS_BLOCK_DIGIT_COUNTS: readonly number[] = [64, 64];

/**
 * Array of WOTS block public keys — one per assert block.
 * Matches Rust `btc_vault::WotsPublicKeyBlocks = Vec<WotsBlockPublicKey>`.
 */
export type WotsPublicKeys = WotsBlockPublicKey[];

/**
 * A challenge used during the mnemonic backup verification flow. The user
 * is asked to enter the words at the given indices to prove they wrote
 * down the mnemonic.
 */
export interface VerificationChallenge {
  indices: number[];
  expectedWords: string[];
}

/**
 * Generate a new 12-word BIP-39 mnemonic with 128 bits of entropy.
 *
 * Uses the standard English wordlist (2048 words). The resulting mnemonic
 * includes a checksum per the BIP-39 specification.
 *
 * @returns A space-separated 12-word mnemonic string.
 */
export function generateWotsMnemonic(): string {
  return generateMnemonic(wordlist, MNEMONIC_ENTROPY_BITS);
}

/**
 * Validate whether a string is a well-formed BIP-39 mnemonic.
 *
 * Checks word count, wordlist membership, and checksum validity.
 *
 * @param mnemonic - The mnemonic string to validate.
 * @returns `true` if the mnemonic is valid BIP-39 with correct checksum.
 */
export function isValidMnemonic(mnemonic: string): boolean {
  return validateMnemonic(mnemonic, wordlist);
}

/**
 * Split a mnemonic string into its individual words.
 *
 * @param mnemonic - A space-separated mnemonic string.
 * @returns Array of individual words.
 */
export function getMnemonicWords(mnemonic: string): string[] {
  return mnemonic.split(" ");
}

/**
 * Create a verification challenge by randomly selecting word positions from
 * the mnemonic. Used during the backup flow to confirm the user has written
 * down their recovery phrase.
 *
 * @param mnemonic - The mnemonic to create a challenge for.
 * @param count    - Number of words to challenge (default 3).
 * @returns An object with the selected `indices` (sorted ascending) and
 *          the `expectedWords` at those positions.
 * @throws If `count` is out of the valid range `[1, wordCount]`.
 */
export function createVerificationChallenge(
  mnemonic: string,
  count: number = 3,
): VerificationChallenge {
  const words = getMnemonicWords(mnemonic);
  if (count <= 0 || count > words.length) {
    throw new Error(`Invalid count: must be between 1 and ${words.length}`);
  }
  const indices: number[] = [];

  while (indices.length < count) {
    const randomBytes = new Uint8Array(4);
    crypto.getRandomValues(randomBytes);
    const randomValue = new DataView(randomBytes.buffer).getUint32(0, false);
    const index = randomValue % words.length;
    if (!indices.includes(index)) {
      indices.push(index);
    }
  }

  indices.sort((a, b) => a - b);

  return {
    indices,
    expectedWords: indices.map((i) => words[i]),
  };
}

/**
 * Verify user-provided answers against a verification challenge.
 *
 * Comparison is case-insensitive and trims whitespace from answers.
 *
 * @param challenge - The challenge created by {@link createVerificationChallenge}.
 * @param answers   - User-provided words in the same order as `challenge.indices`.
 * @returns `true` if all answers match the expected words.
 */
export function verifyMnemonicWords(
  challenge: VerificationChallenge,
  answers: string[],
): boolean {
  if (answers.length !== challenge.expectedWords.length) return false;
  return challenge.expectedWords.every(
    (word, i) => word.toLowerCase() === answers[i].toLowerCase().trim(),
  );
}

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

// ---------------------------------------------------------------------------
// WOTS chain derivation internals — mirrors Rust babe::wots
// ---------------------------------------------------------------------------

/**
 * Compute the default checksum radix for a given W_max.
 * Matches Rust `default_checksum_radix(w_max)`:
 *   smallest radix where radix² >= w_max + 1, at least 2.
 */
function defaultChecksumRadix(wMax: number): number {
  let radix = 1;
  while (radix * radix < wMax + 1) radix++;
  return Math.max(radix, 2);
}

/**
 * Create a WOTS config for a given message digit count.
 * Matches Rust `babe::wots::Config::new(WOTS_DIGIT_BITS, n)`.
 */
function createWotsConfig(n: number): WotsConfig {
  const d = WOTS_DIGIT_BITS;
  const maxVal = maxDigitValue(d);
  const wMax = n * maxVal;
  return { d, n, checksum_radix: defaultChecksumRadix(wMax) };
}

/** Maximum value representable by a single WOTS digit: `2^d - 1`. */
function maxDigitValue(d: number): number {
  return (1 << d) - 1;
}

/**
 * Derive the starting chain value for a given digit index.
 * Matches Rust `chain_start_for_digit(seed, digit_index)`:
 *   hash160(seed || varint_le(digit_index))
 * where varint_le encodes the index as variable-length little-endian bytes.
 */
function chainStartForDigit(seed: Uint8Array, digitIndex: number): Uint8Array {
  const suffixBytes: number[] = [];
  let idx = digitIndex;
  while (idx > 0) {
    suffixBytes.push(idx & 0xff);
    idx >>>= 8;
  }
  const preimage = new Uint8Array(seed.length + suffixBytes.length);
  preimage.set(seed);
  for (let i = 0; i < suffixBytes.length; i++) {
    preimage[seed.length + i] = suffixBytes[i];
  }
  return hash160(preimage);
}

/**
 * Compute the terminal value of a Hash160 chain of given length.
 * Matches Rust `compute_chain(seed, len)` — returns chain[len].
 */
function computeChainTerminal(start: Uint8Array, steps: number): Uint8Array {
  let current = start;
  for (let i = 0; i < steps; i++) {
    current = hash160(current);
  }
  return current;
}

// ---------------------------------------------------------------------------
// Per-block public key derivation
// ---------------------------------------------------------------------------

/**
 * Derive a single WOTS block public key from a per-block seed.
 *
 * Computes Hash160 chain terminals for each message digit and the two
 * checksum digits, matching Rust `babe::wots::SecretKey::from_seed`.
 *
 * @param blockSeed - 20-byte per-block seed (zeroed by caller).
 * @param config    - WOTS configuration for this block.
 * @returns A single WOTS block public key.
 */
function deriveBlockPublicKey(
  blockSeed: Uint8Array,
  config: WotsConfig,
): WotsBlockPublicKey {
  const k = maxDigitValue(config.d);
  const checksumMinorMax = config.checksum_radix - 1;
  const checksumMajorMax = Math.floor((config.n * k) / config.checksum_radix);

  // Message chain terminals (digit indices 2..n+2 in canonical order)
  const messageTerminals: number[][] = [];
  for (let digit = 0; digit < config.n; digit++) {
    const start = chainStartForDigit(blockSeed, digit + WOTS_CHECKSUM_DIGITS);
    const terminal = computeChainTerminal(start, k);
    messageTerminals.push(Array.from(terminal));
  }

  // Checksum chain terminals
  const checksumMinorStart = chainStartForDigit(
    blockSeed,
    CHECKSUM_MINOR_DIGIT_INDEX,
  );
  const checksumMinorTerminal = computeChainTerminal(
    checksumMinorStart,
    checksumMinorMax,
  );

  const checksumMajorStart = chainStartForDigit(
    blockSeed,
    CHECKSUM_MAJOR_DIGIT_INDEX,
  );
  const checksumMajorTerminal = computeChainTerminal(
    checksumMajorStart,
    checksumMajorMax,
  );

  return {
    config,
    message_terminals: messageTerminals,
    checksum_major_terminal: Array.from(checksumMajorTerminal),
    checksum_minor_terminal: Array.from(checksumMinorTerminal),
  };
}

// ---------------------------------------------------------------------------
// Seed and public key derivation
// ---------------------------------------------------------------------------

/**
 * Convert a BIP-39 mnemonic into a 64-byte seed.
 *
 * @param mnemonic - A valid 12-word BIP-39 mnemonic.
 * @returns 64-byte seed suitable for {@link deriveWotsBlockPublicKeys}.
 */
export function mnemonicToWotsSeed(mnemonic: string): Uint8Array {
  const seed = mnemonicToSeedSync(mnemonic);
  const copy = new Uint8Array(seed);
  seed.fill(0);
  return copy;
}

/**
 * Derive deterministic WOTS block public keys for a specific vault.
 *
 * Produces an array of {@link WotsBlockPublicKey} (one per assert block),
 * matching the Rust `Vec<babe::wots::PublicKey>` format expected by the
 * vault provider's `submitDepositorWotsKey` RPC.
 *
 * ### Derivation steps
 *
 * 1. **Split the BIP-39 seed** — bytes `[0..32)` = parent key, `[32..64)` = chain code.
 *
 * 2. **Per-vault child key** — `HMAC-SHA-512(chainCode, parentKey || vaultData)`,
 *    where vaultData = lenPrefix(vaultId) || lenPrefix(depositorPk) || lenPrefix(appContractAddress).
 *
 * 3. **Per-block WOTS seed** — `hash160(derivedKey || blockIndex)` → 20-byte seed per block.
 *
 * 4. **Chain derivation** (per Rust `babe::wots::SecretKey::from_seed`):
 *    - Message chain `i`: start = `hash160(blockSeed || varint_le(i + 2))`, then
 *      iterate Hash160 for `k = 2^d - 1 = 15` steps. Terminal = public key.
 *    - Checksum minor chain: start at digit index 0, iterate for `checksumMinorMax` steps.
 *    - Checksum major chain: start at digit index 1, iterate for `checksumMajorMax` steps.
 *
 * @param seed               - 64-byte seed from {@link mnemonicToWotsSeed}. Zeroed after use.
 * @param vaultId            - Unique identifier (pegin tx hash).
 * @param depositorPk        - Depositor's BTC public key (hex string).
 * @param appContractAddress - Application contract address.
 * @returns Array of WOTS block public keys (currently 2 blocks).
 */
export async function deriveWotsBlockPublicKeys(
  seed: Uint8Array,
  vaultId: string,
  depositorPk: string,
  appContractAddress: string,
): Promise<WotsPublicKeys> {
  vaultId = stripHexPrefix(vaultId).toLowerCase();
  depositorPk = stripHexPrefix(depositorPk).toLowerCase();

  const chainCode = seed.slice(KEY_SIZE, SEED_SIZE);
  const parentKey = seed.slice(0, KEY_SIZE);
  const hmacResult = hmacSha512(
    chainCode,
    concatBytes(
      parentKey,
      concatBytes(
        lengthPrefixed(stringToBytes(vaultId)),
        lengthPrefixed(stringToBytes(depositorPk)),
        lengthPrefixed(stringToBytes(appContractAddress.toLowerCase())),
      ),
    ),
  );
  const derivedKey = hmacResult.slice(0, KEY_SIZE);

  try {
    const blocks: WotsBlockPublicKey[] = [];

    for (
      let blockIdx = 0;
      blockIdx < ASSERT_WOTS_BLOCK_DIGIT_COUNTS.length;
      blockIdx++
    ) {
      const n = ASSERT_WOTS_BLOCK_DIGIT_COUNTS[blockIdx];
      const config = createWotsConfig(n);

      // Derive per-block 20-byte seed: hash160(derivedKey || blockIndex)
      const blockSeedInput = new Uint8Array(derivedKey.length + 1);
      blockSeedInput.set(derivedKey);
      blockSeedInput[derivedKey.length] = blockIdx;
      const blockSeed = hash160(blockSeedInput);

      try {
        blocks.push(deriveBlockPublicKey(blockSeed, config));
      } finally {
        blockSeedInput.fill(0);
        blockSeed.fill(0);
      }
    }

    return blocks;
  } finally {
    // Ensure sensitive material is always wiped, even on exceptions
    chainCode.fill(0);
    parentKey.fill(0);
    hmacResult.fill(0);
    derivedKey.fill(0);
    seed.fill(0);
  }
}

// ---------------------------------------------------------------------------
// Hash computation
// ---------------------------------------------------------------------------

/** Convert a byte array to a lowercase hex string. */
const toHex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

/**
 * Compute the keccak256 hash of WOTS block public keys.
 *
 * Matches Rust `btc_vault::wots_public_keys_keccak256`: for each block,
 * chain tips are concatenated in canonical order
 * `[checksum_minor, checksum_major, message_terminals...]`, then all
 * blocks are concatenated and hashed.
 *
 * The result is committed on-chain as `depositorWotsPkHash` so the vault
 * provider can later verify submitted WOTS public keys.
 *
 * @param publicKeys - Array of WOTS block public keys.
 * @returns 32-byte keccak256 digest as a `0x`-prefixed hex string.
 */
export function computeWotsPublicKeysHash(
  publicKeys: WotsPublicKeys,
): `0x${string}` {
  if (publicKeys.length === 0) {
    throw new Error(
      "computeWotsPublicKeysHash: public keys array must not be empty",
    );
  }

  // Use actual array lengths (not config.n) so the hash covers exactly the
  // chain tips present in the payload — matching Rust's iteration over
  // public_key.chain_tips().
  let totalTips = 0;
  for (const pk of publicKeys) {
    totalTips += WOTS_CHECKSUM_DIGITS + pk.message_terminals.length;
  }

  const buffer = new Uint8Array(totalTips * CHAIN_ELEMENT_SIZE);
  let offset = 0;

  for (const pk of publicKeys) {
    // Canonical order: checksum_minor, checksum_major, then message terminals
    buffer.set(pk.checksum_minor_terminal, offset);
    offset += CHAIN_ELEMENT_SIZE;
    buffer.set(pk.checksum_major_terminal, offset);
    offset += CHAIN_ELEMENT_SIZE;
    for (const terminal of pk.message_terminals) {
      buffer.set(terminal, offset);
      offset += CHAIN_ELEMENT_SIZE;
    }
  }

  const digest = keccak_256(buffer);
  return `0x${toHex(digest)}`;
}

/**
 * Convenience wrapper: derive WOTS block public keys from a mnemonic and
 * return the keccak256 hash. Handles seed creation and cleanup.
 *
 * Used before the ETH transaction to produce the `depositorWotsPkHash`
 * that gets committed on-chain.
 */
export async function deriveWotsPkHash(
  mnemonic: string,
  peginTxid: string,
  depositorBtcPubkey: string,
  appContractAddress: string,
): Promise<`0x${string}`> {
  const seed = mnemonicToWotsSeed(mnemonic);
  try {
    const publicKeys = await deriveWotsBlockPublicKeys(
      seed,
      peginTxid,
      depositorBtcPubkey,
      appContractAddress,
    );
    return computeWotsPublicKeysHash(publicKeys);
  } finally {
    seed.fill(0);
  }
}

/**
 * Check whether an error from the vault provider indicates that the
 * submitted WOTS public key hash does not match the on-chain
 * commitment. This signals that the wrong mnemonic was used, as
 * opposed to a transient network or validation error.
 *
 * The backend error message is:
 *   "WOTS public key hash does not match on-chain commitment"
 */
export function isWotsMismatchError(error: unknown): boolean {
  const msg =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  return /wots.*hash.*does not match/i.test(msg);
}
