/**
 * HTLC Secret Utilities
 *
 * The atomic swap pegin flow uses an HTLC (Hash Time Lock Contract) where the
 * depositor commits to a secret preimage H = SHA256(secret). This module
 * provides utilities to generate the secret and derive the hash commitment.
 *
 * The secret must be stored securely — it is needed to claim the HTLC output
 * if the atomic swap does not complete. Store it alongside the pending pegin
 * in localStorage or derive it deterministically from the mnemonic.
 */

/** Generate a cryptographically secure random 32-byte HTLC secret. */
export function generateHtlcSecret(): Uint8Array {
  const secret = new Uint8Array(32);
  crypto.getRandomValues(secret);
  return secret;
}

/**
 * Compute the HTLC hash commitment H = SHA256(secret).
 *
 * @param secret - 32-byte random secret
 * @returns 64-character hex string (32 bytes, no "0x" prefix)
 */
export async function hashHFromSecret(secret: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", secret.buffer as ArrayBuffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
