/**
 * Bitcoin Utilities
 *
 * Common pure utility functions for Bitcoin operations including:
 * - Public key conversions (x-only format)
 * - Hex string manipulation
 * - Uint8Array conversions and validation
 * - Address derivation and validation
 *
 * All functions are pure (no side effects) and work in Node.js, browsers,
 * and serverless environments.
 *
 * @module primitives/utils/bitcoin
 */

import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { Buffer } from "buffer";
import { initEccLib, networks, payments } from "bitcoinjs-lib";

import type { Network } from "@babylonlabs-io/babylon-tbv-rust-wasm";
import type { Hex } from "viem";

/**
 * BIP-341 Tapscript leaf version for script-path spends.
 * @see https://github.com/bitcoin/bips/blob/master/bip-0341.mediawiki
 * @see Rust: bitcoin::taproot::LeafVersion::TapScript
 */
export const TAPSCRIPT_LEAF_VERSION = 0xc0;

/**
 * Strip "0x" prefix from hex string if present.
 *
 * Bitcoin expects plain hex (no "0x" prefix), but frontend often uses
 * Ethereum-style "0x"-prefixed hex.
 *
 * @param hex - Hex string with or without "0x" prefix
 * @returns Hex string without "0x" prefix
 */
export function stripHexPrefix(hex: string): string {
  return hex.startsWith("0x") ? hex.slice(2) : hex;
}

/**
 * Ensure "0x" prefix on a hex string, returning viem's Hex type.
 *
 * Ethereum/viem APIs expect `0x`-prefixed hex, but Bitcoin tooling
 * typically omits the prefix. This normalises either form.
 *
 * @param hex - Hex string with or without "0x" prefix
 * @returns `0x`-prefixed hex string typed as viem Hex
 */
export function ensureHexPrefix(hex: string): Hex {
  return hex.startsWith("0x") ? (hex as Hex) : (`0x${hex}` as Hex);
}

/**
 * Convert hex string to Uint8Array.
 *
 * @param hex - Hex string (with or without 0x prefix)
 * @returns Uint8Array
 * @throws If hex is invalid
 */
export function hexToUint8Array(hex: string): Uint8Array {
  const cleanHex = stripHexPrefix(hex);
  if (!isValidHexRaw(cleanHex)) {
    throw new Error(`Invalid hex string: ${hex}`);
  }
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.slice(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Convert Uint8Array to hex string (without 0x prefix).
 *
 * @param bytes - Uint8Array to convert
 * @returns Hex string without 0x prefix
 */
export function uint8ArrayToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Convert a 33-byte public key to 32-byte x-only format (removes first byte).
 *
 * Used for Taproot/Schnorr signatures which only need the x-coordinate.
 * If the input is already 32 bytes, returns it unchanged.
 *
 * @param pubKey - 33-byte or 32-byte public key
 * @returns 32-byte x-only public key
 */
export function toXOnly(pubKey: Uint8Array): Uint8Array {
  return pubKey.length === 32 ? pubKey : pubKey.slice(1, 33);
}

/**
 * Internal helper: Validate hex string format without stripping prefix
 *
 * @internal
 * @param hex - Hex string (must already have prefix stripped)
 * @returns true if valid hex string
 */
function isValidHexRaw(hex: string): boolean {
  return /^[0-9a-fA-F]*$/.test(hex) && hex.length % 2 === 0;
}

/**
 * Process and convert a public key to x-only format (32 bytes hex).
 *
 * Handles:
 * - 0x prefix removal
 * - Hex character validation
 * - Length validation
 * - Conversion to x-only format
 *
 * Accepts:
 * - 64 hex chars (32 bytes) - already x-only
 * - 66 hex chars (33 bytes) - compressed pubkey
 * - 130 hex chars (65 bytes) - uncompressed pubkey
 *
 * @param publicKeyHex - Public key in hex format (with or without 0x prefix)
 * @returns X-only public key as 32 bytes hex string (without 0x prefix)
 * @throws If public key format is invalid or contains invalid hex characters
 */
export function processPublicKeyToXOnly(publicKeyHex: string): string {
  // Remove '0x' prefix if present
  const cleanHex = stripHexPrefix(publicKeyHex);

  // Validate hex characters early to prevent silent failures
  if (!isValidHexRaw(cleanHex)) {
    throw new Error(`Invalid hex characters in public key: ${publicKeyHex}`);
  }

  // If already 64 chars (32 bytes), it's already x-only format
  if (cleanHex.length === 64) {
    return cleanHex;
  }

  // Validate public key length (should be 66 chars for compressed or 130 for uncompressed)
  if (cleanHex.length !== 66 && cleanHex.length !== 130) {
    throw new Error(
      `Invalid public key length: ${cleanHex.length} (expected 64, 66, or 130 hex chars)`,
    );
  }

  const pubkeyBytes = hexToUint8Array(cleanHex);
  return uint8ArrayToHex(toXOnly(pubkeyBytes));
}

/**
 * Validate hex string format.
 *
 * Checks that the string contains only valid hexadecimal characters (0-9, a-f, A-F)
 * and has an even length (since each byte is represented by 2 hex characters).
 *
 * @param hex - String to validate (with or without 0x prefix)
 * @returns true if valid hex string
 */
export function isValidHex(hex: string): boolean {
  const cleanHex = stripHexPrefix(hex);
  return isValidHexRaw(cleanHex);
}

/**
 * Result of validating a wallet public key against an expected depositor public key.
 */
export interface WalletPubkeyValidationResult {
  /** Wallet's raw public key (as returned by wallet, may be compressed) */
  walletPubkeyRaw: string;
  /** Wallet's public key in x-only format (32 bytes, 64 hex chars) */
  walletPubkeyXOnly: string;
  /** The validated depositor public key (x-only format) */
  depositorPubkey: string;
}

/**
 * Validate that a wallet's public key matches the expected depositor public key.
 *
 * This function:
 * 1. Converts the wallet pubkey to x-only format
 * 2. Uses the expected depositor pubkey if provided, otherwise falls back to wallet pubkey
 * 3. Validates they match (case-insensitive)
 *
 * @param walletPubkeyRaw - Raw public key from wallet (may be compressed 66 chars or x-only 64 chars)
 * @param expectedDepositorPubkey - Expected depositor public key (x-only, optional)
 * @returns Validation result with both pubkey formats
 * @throws If wallet pubkey doesn't match expected depositor pubkey
 */
export function validateWalletPubkey(
  walletPubkeyRaw: string,
  expectedDepositorPubkey?: string,
): WalletPubkeyValidationResult {
  const walletPubkeyXOnly = processPublicKeyToXOnly(walletPubkeyRaw);
  const depositorPubkey = expectedDepositorPubkey ?? walletPubkeyXOnly;

  if (walletPubkeyXOnly.toLowerCase() !== depositorPubkey.toLowerCase()) {
    throw new Error(
      `Wallet public key does not match vault depositor. ` +
      `Expected: ${depositorPubkey}, Got: ${walletPubkeyXOnly}. ` +
      `Please connect the wallet that was used to create this vault.`
    );
  }

  return { walletPubkeyRaw, walletPubkeyXOnly, depositorPubkey };
}

// ============================================================================
// Address derivation and validation
// ============================================================================

let eccInitialized = false;

/**
 * Lazily initialize the ECC library for bitcoinjs-lib.
 *
 * Must be called before any P2TR / Taproot address operation.
 * Safe to call multiple times — only runs verification once.
 *
 * Why lazy: module-level `initEccLib(ecc)` breaks vitest because
 * `vi.mock()` hoists above imports, so the mocked bitcoinjs-lib
 * hasn't loaded the real ECC backend when the module evaluates.
 */
export function ensureEcc(): void {
  if (!eccInitialized) {
    initEccLib(ecc);
    eccInitialized = true;
  }
}

/**
 * Map SDK network type to bitcoinjs-lib Network object.
 *
 * @param network - Network type ("bitcoin", "testnet", "signet", "regtest")
 * @returns bitcoinjs-lib Network object
 */
export function getNetwork(network: Network): networks.Network {
  switch (network) {
    case "bitcoin":
      return networks.bitcoin;
    case "testnet":
    case "signet":
      return networks.testnet;
    case "regtest":
      return networks.regtest;
    default:
      throw new Error(`Unknown network: ${network}`);
  }
}

/**
 * Derive a Taproot (P2TR) address from a public key.
 *
 * @param publicKeyHex - Compressed (66 hex) or x-only (64 hex) public key
 * @param network - Bitcoin network
 * @returns Taproot address (bc1p... / tb1p... / bcrt1p...)
 */
export function deriveTaprootAddress(
  publicKeyHex: string,
  network: Network,
): string {
  ensureEcc();
  const xOnly = hexToUint8Array(processPublicKeyToXOnly(publicKeyHex));
  const { address } = payments.p2tr({
    internalPubkey: Buffer.from(xOnly),
    network: getNetwork(network),
  });
  if (!address) {
    throw new Error("Failed to derive taproot address from public key");
  }
  return address;
}

/**
 * Derive a Native SegWit (P2WPKH) address from a compressed public key.
 *
 * @param publicKeyHex - Compressed public key (66 hex chars, with or without 0x prefix)
 * @param network - Bitcoin network
 * @returns Native SegWit address (bc1q... / tb1q... / bcrt1q...)
 * @throws If publicKeyHex is not a compressed public key (66 hex chars)
 */
export function deriveNativeSegwitAddress(
  publicKeyHex: string,
  network: Network,
): string {
  const cleanHex = stripHexPrefix(publicKeyHex);
  if (cleanHex.length !== 66) {
    throw new Error(
      `Native SegWit requires a compressed public key (66 hex chars), got ${cleanHex.length}`,
    );
  }
  const { address } = payments.p2wpkh({
    pubkey: Buffer.from(hexToUint8Array(cleanHex)),
    network: getNetwork(network),
  });
  if (!address) {
    throw new Error(
      "Failed to derive native segwit address from public key",
    );
  }
  return address;
}

/**
 * Validate that a BTC address was derived from the given public key.
 *
 * Derives Taproot (P2TR) and Native SegWit (P2WPKH) addresses from the
 * public key and checks if the provided address matches any of them.
 *
 * When the input is an x-only key (64 hex chars), both possible compressed
 * keys (`02` + x and `03` + x) are tried for Native SegWit derivation,
 * since the y-parity is unknown.
 *
 * @param address - BTC address to validate
 * @param publicKeyHex - Public key from the wallet (x-only 64 or compressed 66 hex chars)
 * @param network - Bitcoin network
 * @returns true if the address matches the public key
 */
export function isAddressFromPublicKey(
  address: string,
  publicKeyHex: string,
  network: Network,
): boolean {
  const cleanHex = stripHexPrefix(publicKeyHex);

  // P2TR — works with both x-only and compressed keys
  try {
    if (address === deriveTaprootAddress(cleanHex, network)) {
      return true;
    }
  } catch {
    // derivation failed, continue
  }

  // Build the list of compressed keys to try for P2WPKH
  const compressedKeys: string[] = [];
  if (cleanHex.length === 66) {
    compressedKeys.push(cleanHex);
  } else if (cleanHex.length === 64) {
    // x-only key — try both even (02) and odd (03) y-parity
    compressedKeys.push(`02${cleanHex}`, `03${cleanHex}`);
  }

  for (const key of compressedKeys) {
    try {
      if (address === deriveNativeSegwitAddress(key, network)) {
        return true;
      }
    } catch {
      // derivation failed, continue
    }
  }

  return false;
}
