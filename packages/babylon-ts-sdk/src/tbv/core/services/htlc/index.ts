/**
 * HTLC Secret / Hashlock Utilities
 *
 * Pure functions for computing and validating SHA-256 hashlocks used in the
 * vault deposit protocol's HTLC (Hash Time Lock Contract).
 *
 * The SDK does NOT generate secrets — that is the caller's responsibility.
 * Today callers use `crypto.getRandomValues(32)`; when the `deriveContextHash`
 * wallet API ships, callers will use `wallet.deriveContextHash("babylon-vault", ctx)`.
 * These utilities work identically regardless of how the secret was produced.
 *
 * On-chain contract validation (BTCVaultRegistry.activateVaultWithSecret):
 *   if (sha256(abi.encodePacked(s)) != hashlock) revert InvalidSecret();
 *
 * @module htlc
 */

import { sha256 } from "@noble/hashes/sha2.js";
import type { Hex } from "viem";

/** Expected hex length for a 0x-prefixed bytes32 value. */
const HEX_BYTES32_LENGTH = 66; // "0x" + 64 hex chars

/**
 * Decode a 0x-prefixed hex string to bytes, with strict validation.
 * @throws if the input is not a valid 0x-prefixed hex string
 */
function hexToBytes(hex: Hex): Uint8Array {
  if (!hex.startsWith("0x") && !hex.startsWith("0X")) {
    throw new Error("Expected 0x-prefixed hex string");
  }
  const clean = hex.slice(2);
  if (clean.length % 2 !== 0) {
    throw new Error(`Hex string has odd length: ${clean.length}`);
  }
  if (!/^[0-9a-fA-F]*$/.test(clean)) {
    throw new Error("Hex string contains non-hex characters");
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Encode a Uint8Array as a 0x-prefixed lowercase hex string.
 */
function bytesToHex(bytes: Uint8Array): Hex {
  return `0x${Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}`;
}

/**
 * Validate that a value is a 0x-prefixed bytes32 (exactly 32 bytes).
 * @throws if the value is not exactly 32 bytes
 */
function assertBytes32(value: Hex, label: string): void {
  if (value.length !== HEX_BYTES32_LENGTH) {
    throw new Error(
      `${label} must be exactly 32 bytes (${HEX_BYTES32_LENGTH} hex chars with 0x prefix), got ${value.length}`,
    );
  }
}

/**
 * Compute the SHA-256 hashlock from a secret preimage.
 *
 * Matches the on-chain validation: `sha256(abi.encodePacked(s))` where `s` is a `bytes32`.
 * `abi.encodePacked(bytes32)` is just the raw 32 bytes — no ABI padding.
 *
 * @param secret - 0x-prefixed bytes32 secret (66 hex chars)
 * @returns 0x-prefixed bytes32 SHA-256 hash
 * @throws if secret is not exactly 32 bytes
 */
export function computeHashlock(secret: Hex): Hex {
  assertBytes32(secret, "Secret");
  const secretBytes = hexToBytes(secret);
  const hash = sha256(secretBytes);
  return bytesToHex(hash);
}

/**
 * Validate that a secret's SHA-256 hash matches the expected hashlock.
 *
 * Use this for client-side pre-validation before sending the activation
 * transaction to avoid wasting gas on a contract revert.
 *
 * @param secret - 0x-prefixed bytes32 secret (66 hex chars)
 * @param hashlock - 0x-prefixed bytes32 expected hashlock from the vault
 * @returns true if SHA-256(secret) matches the hashlock
 * @throws if secret or hashlock is not exactly 32 bytes
 */
export function validateSecretAgainstHashlock(
  secret: Hex,
  hashlock: Hex,
): boolean {
  assertBytes32(secret, "Secret");
  assertBytes32(hashlock, "Hashlock");
  // Validate hashlock is valid hex (secret is validated inside computeHashlock)
  hexToBytes(hashlock);

  const computed = computeHashlock(secret);
  return computed.toLowerCase() === hashlock.toLowerCase();
}
