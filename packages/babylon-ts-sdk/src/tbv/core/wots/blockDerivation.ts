/**
 * WOTS Block Key Derivation
 *
 * Derives deterministic WOTS (Winternitz One-Time Signature) block public keys
 * for Babylon vault deposits, matching the Rust `babe::wots` implementation.
 *
 * The SDK function takes a raw `seed: Uint8Array` and does not prescribe how
 * the seed was produced. Today callers derive it from a BIP-39 mnemonic via
 * `mnemonicToWotsSeed()`; when the `deriveContextHash` wallet API ships,
 * callers will use a different seed expansion path. The core block derivation
 * logic stays the same either way.
 *
 * @module wots/blockDerivation
 */

import type {
  WotsBlockPublicKey,
  WotsConfig,
} from "../clients/vault-provider/types";

import { hmac } from "@noble/hashes/hmac.js";
import { ripemd160 } from "@noble/hashes/legacy.js";
import { sha256, sha512 } from "@noble/hashes/sha2.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { mnemonicToSeedSync } from "@scure/bip39";
import type { Hex } from "viem";

// ---------------------------------------------------------------------------
// Constants — must match btc-vault / babe::wots
// ---------------------------------------------------------------------------

/** Size in bytes of the parent key or derived key (first half of 64-byte seed). */
const KEY_SIZE = 32;

/** Size in bytes of the full seed (BIP-39 produces 64 bytes). */
const SEED_SIZE = 64;

/** Size of the big-endian length prefix for variable-length fields. */
const LENGTH_PREFIX_SIZE = 4;

/** Hash160 output size in bytes (= RIPEMD-160(SHA-256(x))). */
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
 */
const ASSERT_WOTS_BLOCK_DIGIT_COUNTS: readonly number[] = [64, 64];

// ---------------------------------------------------------------------------
// Byte utilities
// ---------------------------------------------------------------------------

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

function stringToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

function lengthPrefixed(data: Uint8Array): Uint8Array {
  const len = new Uint8Array(LENGTH_PREFIX_SIZE);
  new DataView(len.buffer).setUint32(0, data.length, false);
  return concatBytes(len, data);
}

function stripHexPrefix(hex: string): string {
  return hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
}

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

// ---------------------------------------------------------------------------
// Cryptographic primitives
// ---------------------------------------------------------------------------

function hmacSha512(key: Uint8Array, data: Uint8Array): Uint8Array {
  return hmac(sha512, key, data);
}

function hash160(data: Uint8Array): Uint8Array {
  return ripemd160(sha256(data));
}

// ---------------------------------------------------------------------------
// WOTS chain derivation — mirrors Rust babe::wots
// ---------------------------------------------------------------------------

/** Maximum value representable by a single WOTS digit: `2^d - 1`. */
function maxDigitValue(d: number): number {
  return (1 << d) - 1;
}

/**
 * Compute the default checksum radix for a given W_max.
 * Matches Rust `default_checksum_radix(w_max)`.
 */
function defaultChecksumRadix(wMax: number): number {
  let radix = 1;
  while (radix * radix < wMax + 1) radix++;
  return Math.max(radix, 2);
}

/** Create a WOTS config for a given message digit count. */
function createWotsConfig(n: number): WotsConfig {
  const d = WOTS_DIGIT_BITS;
  const maxVal = maxDigitValue(d);
  const wMax = n * maxVal;
  return { d, n, checksum_radix: defaultChecksumRadix(wMax) };
}

/**
 * Derive the starting chain value for a given digit index.
 * Matches Rust `chain_start_for_digit(seed, digit_index)`:
 *   hash160(seed || varint_le(digit_index))
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
// Seed derivation
// ---------------------------------------------------------------------------

/**
 * Derive a 64-byte WOTS seed from a BIP-39 mnemonic.
 *
 * Internally uses PBKDF2 with 2048 rounds of HMAC-SHA-512 and the passphrase
 * `"mnemonic"` (no user password), per the BIP-39 specification.
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Derive deterministic WOTS block public keys for a specific vault.
 *
 * Produces an array of {@link WotsBlockPublicKey} (one per assert block),
 * matching the Rust `Vec<babe::wots::PublicKey>` format expected by the
 * vault provider's `submitDepositorWotsKey` RPC.
 *
 * The VP expects exactly 2 blocks and validates that keccak256 of the
 * concatenated chain tips matches the on-chain `depositorWotsPkHash`.
 *
 * @param seed               - 64-byte seed (e.g. from `mnemonicToWotsSeed`). Zeroed after use.
 * @param vaultId            - Vault identifier / pegin tx hash (hex, with or without 0x prefix).
 * @param depositorPk        - Depositor's BTC public key (hex, with or without 0x prefix).
 * @param appContractAddress - Application contract address.
 * @returns Array of 2 WOTS block public keys.
 * @throws If seed is not exactly 64 bytes.
 */
export async function deriveWotsBlockPublicKeys(
  seed: Uint8Array,
  vaultId: string,
  depositorPk: string,
  appContractAddress: string,
): Promise<WotsBlockPublicKey[]> {
  if (seed.length !== SEED_SIZE) {
    throw new Error(
      `WOTS seed must be exactly ${SEED_SIZE} bytes, got ${seed.length}`,
    );
  }

  const cleanVaultId = stripHexPrefix(vaultId).toLowerCase();
  const cleanDepositorPk = stripHexPrefix(depositorPk).toLowerCase();

  const chainCode = seed.slice(KEY_SIZE, SEED_SIZE);
  const parentKey = seed.slice(0, KEY_SIZE);
  const hmacPreimage = concatBytes(
    parentKey,
    concatBytes(
      lengthPrefixed(stringToBytes(cleanVaultId)),
      lengthPrefixed(stringToBytes(cleanDepositorPk)),
      lengthPrefixed(stringToBytes(appContractAddress.toLowerCase())),
    ),
  );
  const hmacResult = hmacSha512(chainCode, hmacPreimage);
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
        const block = deriveBlockPublicKey(blockSeed, config);

        // Runtime validation (Codex review requirement)
        if (block.config.d !== WOTS_DIGIT_BITS) {
          throw new Error(`Block ${blockIdx}: expected d=${WOTS_DIGIT_BITS}, got d=${block.config.d}`);
        }
        if (block.config.n !== n) {
          throw new Error(`Block ${blockIdx}: expected n=${n}, got n=${block.config.n}`);
        }
        if (block.message_terminals.length !== n) {
          throw new Error(`Block ${blockIdx}: expected ${n} message terminals, got ${block.message_terminals.length}`);
        }
        for (let t = 0; t < block.message_terminals.length; t++) {
          if (block.message_terminals[t].length !== CHAIN_ELEMENT_SIZE) {
            throw new Error(`Block ${blockIdx} terminal ${t}: expected ${CHAIN_ELEMENT_SIZE} bytes, got ${block.message_terminals[t].length}`);
          }
        }
        if (block.checksum_minor_terminal.length !== CHAIN_ELEMENT_SIZE) {
          throw new Error(`Block ${blockIdx} checksum_minor: expected ${CHAIN_ELEMENT_SIZE} bytes`);
        }
        if (block.checksum_major_terminal.length !== CHAIN_ELEMENT_SIZE) {
          throw new Error(`Block ${blockIdx} checksum_major: expected ${CHAIN_ELEMENT_SIZE} bytes`);
        }

        blocks.push(block);
      } finally {
        blockSeedInput.fill(0);
        blockSeed.fill(0);
      }
    }

    if (blocks.length !== ASSERT_WOTS_BLOCK_DIGIT_COUNTS.length) {
      throw new Error(
        `Expected ${ASSERT_WOTS_BLOCK_DIGIT_COUNTS.length} blocks, got ${blocks.length}`,
      );
    }

    return blocks;
  } finally {
    hmacPreimage.fill(0);
    chainCode.fill(0);
    parentKey.fill(0);
    hmacResult.fill(0);
    derivedKey.fill(0);
    seed.fill(0);
  }
}

/** Validate a single chain terminal: correct length and all bytes in [0, 255]. */
function validateTerminal(
  terminal: number[],
  blockIdx: number,
  label: string,
): void {
  if (terminal.length !== CHAIN_ELEMENT_SIZE) {
    throw new Error(
      `Block ${blockIdx} ${label}: expected ${CHAIN_ELEMENT_SIZE} bytes, got ${terminal.length}`,
    );
  }
  for (let j = 0; j < terminal.length; j++) {
    const b = terminal[j];
    if (!Number.isInteger(b) || b < 0 || b > 255) {
      throw new Error(
        `Block ${blockIdx} ${label}[${j}]: invalid byte value ${b}`,
      );
    }
  }
}

/**
 * Compute the keccak256 hash of WOTS block public keys.
 *
 * Matches Rust `btc_vault::wots_public_keys_keccak256`: for each block,
 * chain tips are concatenated in canonical order
 * `[checksum_minor, checksum_major, message_terminals...]`, then all
 * blocks are concatenated and hashed.
 *
 * The result is committed on-chain as `depositorWotsPkHash` so the vault
 * provider can verify submitted WOTS public keys.
 *
 * @param publicKeys - Array of WOTS block public keys (must not be empty).
 * @returns 0x-prefixed keccak256 hex string.
 */
export function computeWotsBlockPublicKeysHash(
  publicKeys: WotsBlockPublicKey[],
): Hex {
  if (publicKeys.length === 0) {
    throw new Error("Public keys array must not be empty");
  }

  // Validate block structure before hashing to prevent silent zero-padding
  // or byte wrapping from out-of-range number[] values
  for (let i = 0; i < publicKeys.length; i++) {
    const pk = publicKeys[i];
    validateTerminal(pk.checksum_minor_terminal, i, "checksum_minor_terminal");
    validateTerminal(pk.checksum_major_terminal, i, "checksum_major_terminal");
    for (let t = 0; t < pk.message_terminals.length; t++) {
      validateTerminal(pk.message_terminals[t], i, `message_terminal[${t}]`);
    }
  }

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
