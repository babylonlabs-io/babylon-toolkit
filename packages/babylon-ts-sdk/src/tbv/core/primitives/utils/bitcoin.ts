/**
 * Bitcoin Utilities
 *
 * Common pure utility functions for Bitcoin operations including:
 * - Public key conversions (x-only format)
 * - Hex string manipulation
 * - Buffer conversions and validation
 *
 * All functions are pure (no side effects) and work in Node.js, browsers,
 * and serverless environments.
 *
 * @module primitives/utils/bitcoin
 */

/**
 * Strip "0x" prefix from hex string if present
 *
 * Bitcoin expects plain hex (no "0x" prefix), but frontend often uses
 * Ethereum-style "0x"-prefixed hex.
 *
 * @param hex - Hex string with or without "0x" prefix
 * @returns Hex string without "0x" prefix
 *
 * @example
 * ```typescript
 * stripHexPrefix('0xabc123') // 'abc123'
 * stripHexPrefix('abc123')   // 'abc123'
 * stripHexPrefix('')         // ''
 * ```
 */
export function stripHexPrefix(hex: string): string {
  return hex.startsWith("0x") ? hex.slice(2) : hex;
}

/**
 * Convert a 33-byte public key to 32-byte x-only format (removes first byte)
 *
 * Used for Taproot/Schnorr signatures which only need the x-coordinate.
 * If the input is already 32 bytes, returns it unchanged.
 *
 * @param pubKey - 33-byte or 32-byte public key buffer
 * @returns 32-byte x-only public key buffer
 *
 * @example
 * ```typescript
 * const compressedPubkey = Buffer.from('02abc123...', 'hex'); // 33 bytes
 * const xOnly = toXOnly(compressedPubkey); // 32 bytes
 *
 * const alreadyXOnly = Buffer.from('abc123...', 'hex'); // 32 bytes
 * toXOnly(alreadyXOnly); // Returns same buffer
 * ```
 */
export function toXOnly(pubKey: Buffer): Buffer {
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
 * Process and convert a public key to x-only format (32 bytes hex)
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
 * @throws Error if public key format is invalid or contains invalid hex characters
 *
 * @example
 * ```typescript
 * // Already x-only
 * processPublicKeyToXOnly('abc123...') // 64 chars
 * // => 'abc123...' (same, 64 chars)
 *
 * // Compressed pubkey
 * processPublicKeyToXOnly('02abc123...') // 66 chars
 * // => 'abc123...' (64 chars, first byte removed)
 *
 * // With 0x prefix
 * processPublicKeyToXOnly('0x02abc123...') // 66 chars + 0x
 * // => 'abc123...' (64 chars)
 *
 * // Uncompressed pubkey (65 bytes = 130 hex chars)
 * processPublicKeyToXOnly('04abc123...') // 130 chars
 * // => first 32 bytes after prefix
 * ```
 */
export function processPublicKeyToXOnly(publicKeyHex: string): string {
  // Remove '0x' prefix if present
  const cleanHex = stripHexPrefix(publicKeyHex);

  // Validate hex characters early to prevent silent failures
  // Buffer.from() silently converts invalid hex chars to 0x00
  if (!isValidHexRaw(cleanHex)) {
    throw new Error(
      `Invalid hex characters in public key: ${publicKeyHex}`,
    );
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

  const pubkeyBuffer = Buffer.from(cleanHex, "hex");
  return toXOnly(pubkeyBuffer).toString("hex");
}

/**
 * Validate hex string format
 *
 * Checks that the string contains only valid hexadecimal characters (0-9, a-f, A-F)
 * and has an even length (since each byte is represented by 2 hex characters).
 *
 * @param hex - String to validate (with or without 0x prefix)
 * @returns true if valid hex string
 *
 * @example
 * ```typescript
 * isValidHex('abc123')     // true
 * isValidHex('0xabc123')   // true (prefix is stripped)
 * isValidHex('xyz')        // false (invalid characters)
 * isValidHex('abc')        // false (odd length)
 * isValidHex('')           // true (empty is valid)
 * ```
 */
export function isValidHex(hex: string): boolean {
  const cleanHex = stripHexPrefix(hex);
  return isValidHexRaw(cleanHex);
}

/**
 * Convert hex string to Buffer
 *
 * @param hex - Hex string (with or without 0x prefix)
 * @returns Buffer
 * @throws Error if hex is invalid
 *
 * @example
 * ```typescript
 * hexToBuffer('abc123')     // Buffer [0xab, 0xc1, 0x23]
 * hexToBuffer('0xabc123')   // Buffer [0xab, 0xc1, 0x23]
 * hexToBuffer('xyz')        // throws Error
 * ```
 */
export function hexToBuffer(hex: string): Buffer {
  const cleanHex = stripHexPrefix(hex);
  // Use isValidHexRaw to avoid redundant prefix stripping
  if (!isValidHexRaw(cleanHex)) {
    throw new Error(`Invalid hex string: ${hex}`);
  }
  return Buffer.from(cleanHex, "hex");
}

/**
 * Convert Buffer to hex string (without 0x prefix)
 *
 * @param buffer - Buffer to convert
 * @returns Hex string without 0x prefix
 *
 * @example
 * ```typescript
 * const buf = Buffer.from([0xab, 0xc1, 0x23]);
 * bufferToHex(buf)  // 'abc123'
 * ```
 */
export function bufferToHex(buffer: Buffer): string {
  return buffer.toString("hex");
}
