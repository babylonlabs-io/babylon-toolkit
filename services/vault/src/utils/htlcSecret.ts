/**
 * HTLC Secret Utilities
 *
 * The atomic swap pegin flow uses an HTLC (Hash Time Lock Contract) where the
 * depositor commits to a secret preimage H = SHA256(secret). Secret generation
 * is handled by `secretUtils.ts`; this module provides validation utilities
 * for verifying a secret against an on-chain hashlock.
 */

/**
 * Convert a hex string to Uint8Array for hashing.
 * Accepts with or without 0x prefix.
 */
function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) {
    throw new Error(`hex string has odd length: ${clean.length}`);
  }
  if (!/^[0-9a-fA-F]*$/.test(clean)) {
    throw new Error("hex string contains non-hex characters");
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Validate a secret against a vault's hashlock before sending the activation tx.
 *
 * Computes SHA256(secret) and compares to the expected hashlock.
 * Use this for client-side pre-validation to avoid wasting gas on a revert.
 *
 * @param secretHex - Secret hex string (with or without 0x prefix, 32 bytes = 64 hex chars)
 * @param hashlock - Expected hashlock from the vault (0x-prefixed, 32 bytes)
 * @returns true if SHA256(secret) matches the hashlock
 */
export async function validateSecretAgainstHashlock(
  secretHex: string,
  hashlock: string,
): Promise<boolean> {
  const secretBytes = hexToBytes(secretHex);
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    secretBytes as BufferSource,
  );
  const computedHash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const expectedHash = hashlock.startsWith("0x") ? hashlock.slice(2) : hashlock;

  return computedHash.toLowerCase() === expectedHash.toLowerCase();
}
