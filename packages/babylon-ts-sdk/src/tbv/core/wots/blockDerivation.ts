/**
 * WOTS Block Key Derivation
 *
 * Derives deterministic WOTS (Winternitz One-Time Signature) block public
 * keys from a per-vault 64-byte seed, matching the Rust `babe::wots`
 * chain logic.
 *
 * Callers obtain the seed from `expandWotsSeed(root, htlcVout)` in the
 * vault-secrets module, where
 * `root = await deriveVaultRoot(wallet, vaultContextInput)`. Per-vault
 * uniqueness is already encoded in the seed via `htlcVout`, so this
 * module only handles the chain derivation — no further key splitting
 * by `(vaultId, depositorPk, appContract)` is needed.
 *
 * @module wots/blockDerivation
 */

import { ripemd160 } from "@noble/hashes/legacy.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import type { Hex } from "viem";

import type {
  WotsBlockPublicKey,
  WotsConfig,
} from "../clients/vault-provider/types";

// ---------------------------------------------------------------------------
// Constants — must match btc-vault / babe::wots
// ---------------------------------------------------------------------------

/** Required size of the per-vault WOTS seed in bytes. */
const WOTS_SEED_SIZE = 64;

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
// Cryptographic primitives
// ---------------------------------------------------------------------------

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

function hash160(data: Uint8Array): Uint8Array {
  return ripemd160(sha256(data));
}

// ---------------------------------------------------------------------------
// WOTS chain derivation — mirrors Rust babe::wots
// ---------------------------------------------------------------------------

function maxDigitValue(d: number): number {
  return (1 << d) - 1;
}

function defaultChecksumRadix(wMax: number): number {
  let radix = 1;
  while (radix * radix < wMax + 1) radix++;
  return Math.max(radix, 2);
}

function createWotsConfig(n: number): WotsConfig {
  const d = WOTS_DIGIT_BITS;
  const wMax = n * maxDigitValue(d);
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

function deriveBlockPublicKey(
  blockSeed: Uint8Array,
  config: WotsConfig,
): WotsBlockPublicKey {
  const k = maxDigitValue(config.d);
  const checksumMinorMax = config.checksum_radix - 1;
  const checksumMajorMax = Math.floor((config.n * k) / config.checksum_radix);

  const messageTerminals: number[][] = [];
  for (let digit = 0; digit < config.n; digit++) {
    const start = chainStartForDigit(blockSeed, digit + WOTS_CHECKSUM_DIGITS);
    const terminal = computeChainTerminal(start, k);
    messageTerminals.push(Array.from(terminal));
  }

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
// Public API
// ---------------------------------------------------------------------------

/**
 * Derive deterministic WOTS block public keys from a per-vault 64-byte seed.
 *
 * The seed must come from `expandWotsSeed(root, htlcVout)` (vault-secrets
 * module). Per-vault uniqueness is encoded in `htlcVout`; this function
 * only handles the chain derivation. Per-block 20-byte seeds are derived
 * as `hash160(seed || blockIdx)` and fed into the standard Rust
 * `babe::wots` chain logic.
 *
 * The seed is zeroed in the `finally` block.
 *
 * @stability frozen — on-chain-binding. Per-block seed derivation,
 * chain length, checksum-digit ordering, and terminal byte layout
 * must match Rust `babe::wots` byte-for-byte. Any divergence rotates
 * `depositorWotsPkHash` and breaks resume + on-chain verification
 * for every existing vault.
 *
 * @param seed - 64-byte per-vault seed.
 * @returns Array of 2 WOTS block public keys.
 * @throws If `seed.length !== 64`.
 */
export async function deriveWotsBlocksFromSeed(
  seed: Uint8Array,
): Promise<WotsBlockPublicKey[]> {
  // try/finally wraps the size check so the seed buffer is zeroed on
  // every exit path, including malformed-input rejection.
  try {
    if (seed.length !== WOTS_SEED_SIZE) {
      throw new Error(
        `WOTS seed must be exactly ${WOTS_SEED_SIZE} bytes, got ${seed.length}`,
      );
    }

    const blocks: WotsBlockPublicKey[] = [];

    for (
      let blockIdx = 0;
      blockIdx < ASSERT_WOTS_BLOCK_DIGIT_COUNTS.length;
      blockIdx++
    ) {
      const n = ASSERT_WOTS_BLOCK_DIGIT_COUNTS[blockIdx];
      const config = createWotsConfig(n);

      // Per-block 20-byte seed: hash160(seed || blockIdx)
      const blockSeedInput = new Uint8Array(seed.length + 1);
      blockSeedInput.set(seed);
      blockSeedInput[seed.length] = blockIdx;
      const blockSeed = hash160(blockSeedInput);

      try {
        const block = deriveBlockPublicKey(blockSeed, config);

        if (block.config.d !== WOTS_DIGIT_BITS) {
          throw new Error(
            `Block ${blockIdx}: expected d=${WOTS_DIGIT_BITS}, got d=${block.config.d}`,
          );
        }
        if (block.config.n !== n) {
          throw new Error(
            `Block ${blockIdx}: expected n=${n}, got n=${block.config.n}`,
          );
        }
        if (block.message_terminals.length !== n) {
          throw new Error(
            `Block ${blockIdx}: expected ${n} message terminals, got ${block.message_terminals.length}`,
          );
        }
        for (let t = 0; t < block.message_terminals.length; t++) {
          if (block.message_terminals[t].length !== CHAIN_ELEMENT_SIZE) {
            throw new Error(
              `Block ${blockIdx} terminal ${t}: expected ${CHAIN_ELEMENT_SIZE} bytes, got ${block.message_terminals[t].length}`,
            );
          }
        }
        if (block.checksum_minor_terminal.length !== CHAIN_ELEMENT_SIZE) {
          throw new Error(
            `Block ${blockIdx} checksum_minor: expected ${CHAIN_ELEMENT_SIZE} bytes`,
          );
        }
        if (block.checksum_major_terminal.length !== CHAIN_ELEMENT_SIZE) {
          throw new Error(
            `Block ${blockIdx} checksum_major: expected ${CHAIN_ELEMENT_SIZE} bytes`,
          );
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
 * @stability frozen — on-chain-binding. Concatenation order of chain
 * tips and the keccak256 input layout MUST match Rust
 * `btc_vault::wots_public_keys_keccak256` byte-for-byte. Any change
 * rotates the on-chain commitment and breaks every existing vault.
 */
export function computeWotsBlockPublicKeysHash(
  publicKeys: WotsBlockPublicKey[],
): Hex {
  if (publicKeys.length === 0) {
    throw new Error("Public keys array must not be empty");
  }

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
