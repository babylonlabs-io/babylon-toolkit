/**
 * Bitcoin Utilities
 *
 * Common utility functions for Bitcoin operations
 */

import { Buffer } from "buffer";

/**
 * Strip "0x" prefix from hex string if present
 * Bitcoin expects plain hex (no "0x" prefix), but frontend uses Ethereum-style "0x"-prefixed hex
 *
 * @param hex - Hex string with or without "0x" prefix
 * @returns Hex string without "0x" prefix
 *
 * @example
 * ```ts
 * stripHexPrefix('0xabc123') // 'abc123'
 * stripHexPrefix('abc123')   // 'abc123'
 * ```
 */
export function stripHexPrefix(hex: string): string {
  return hex.startsWith("0x") ? hex.slice(2) : hex;
}

/**
 * Convert a 33-byte public key to 32-byte x-only format (removes first byte)
 * Used for Taproot/Schnorr signatures which only need the x-coordinate
 *
 * @param pubKey - 33-byte or 32-byte public key buffer
 * @returns 32-byte x-only public key buffer
 */
export const toXOnly = (pubKey: Buffer): Buffer =>
  pubKey.length === 32 ? pubKey : pubKey.slice(1, 33);

/**
 * Validate that a public key is in x-only format (32 bytes = 64 hex chars)
 * Used for Taproot/Schnorr signatures which require x-only pubkeys
 *
 * @param pubkey - Public key to validate (should be 64 hex chars, no 0x prefix)
 * @throws Error if pubkey is not valid x-only format
 *
 * @example
 * ```ts
 * validateXOnlyPubkey('aa'.repeat(32)) // OK
 * validateXOnlyPubkey('0x' + 'aa'.repeat(32)) // throws
 * validateXOnlyPubkey('aa'.repeat(33)) // throws (66 chars)
 * ```
 */
export function validateXOnlyPubkey(pubkey: string): void {
  if (!pubkey || typeof pubkey !== "string") {
    throw new Error("Invalid pubkey: must be a non-empty string");
  }

  if (!/^[0-9a-fA-F]{64}$/.test(pubkey)) {
    throw new Error(
      "Invalid pubkey format: must be 64 hex characters (32-byte x-only public key, no 0x prefix)",
    );
  }
}

/**
 * Process and convert a public key to x-only format (32 bytes hex)
 * Handles 0x prefix removal, validation, and conversion to x-only format
 *
 * @param publicKeyHex - Public key in hex format (with or without 0x prefix)
 * @returns X-only public key as 32 bytes hex string (without 0x prefix)
 * @throws Error if public key format is invalid
 */
export function processPublicKeyToXOnly(publicKeyHex: string): string {
  // Remove '0x' prefix if present
  const cleanHex = stripHexPrefix(publicKeyHex);

  // If already 64 chars (32 bytes), it's already x-only format
  if (cleanHex.length === 64) {
    return cleanHex;
  }

  // Validate public key length (should be 66 chars for compressed key or 130 for uncompressed)
  if (cleanHex.length !== 66 && cleanHex.length !== 130) {
    throw new Error(
      `Invalid public key length: ${cleanHex.length} (expected 64, 66, or 130 hex chars)`,
    );
  }

  const pubkeyBuffer = Buffer.from(cleanHex, "hex");
  return toXOnly(pubkeyBuffer).toString("hex");
}
