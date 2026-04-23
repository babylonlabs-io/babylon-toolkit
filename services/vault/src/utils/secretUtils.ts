/** Length of the deposit secret in bytes (256-bit). */
const SECRET_LENGTH_BYTES = 32;

/**
 * Generate a cryptographically random secret hex string for the peg-in flow.
 *
 * @returns 64-character lowercase hex string (32 bytes, no 0x prefix)
 */
export function generateSecretHex(): string {
  const bytes = new Uint8Array(SECRET_LENGTH_BYTES);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
