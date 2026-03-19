import { sha256 } from "@noble/hashes/sha2.js";
import type { Hex } from "viem";

/** Length of the deposit secret in bytes (256-bit). */
const SECRET_LENGTH_BYTES = 32;

/**
 * Generate a cryptographically random secret hex string for the new peg-in flow.
 *
 * @returns 64-character lowercase hex string (32 bytes)
 */
export function generateSecretHex(): string {
  const bytes = new Uint8Array(SECRET_LENGTH_BYTES);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Compute the SHA-256 hash of a hex-encoded secret.
 *
 * @param secretHex - 64-character hex string (no 0x prefix)
 * @returns 0x-prefixed SHA-256 hash hex string
 */
export function hashSecret(secretHex: string): Hex {
  const secretBytes = Uint8Array.from(
    secretHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)),
  );
  const hashBytes = sha256(secretBytes);
  return `0x${Array.from(hashBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}`;
}
