/**
 * HTLC Secret Utilities
 *
 * The atomic swap pegin flow uses an HTLC (Hash Time Lock Contract) where the
 * depositor commits to a secret preimage H = SHA256(secret). This module
 * provides utilities to generate the secret and derive the hash commitment.
 *
 * The secret is shown to the user during the deposit flow via the
 * DepositSecretModal. The user must copy and store it — it is NOT persisted
 * by the frontend. The secret is needed to activate the vault on Ethereum
 * and to claim the HTLC refund if the atomic swap does not complete.
 */

/** Generate a cryptographically secure random 32-byte HTLC secret. */
export function generateHtlcSecret(): Uint8Array {
  const secret = new Uint8Array(32);
  crypto.getRandomValues(secret);
  return secret;
}

/** Convert a Uint8Array secret to a hex string (no 0x prefix). */
export function secretToHex(secret: Uint8Array): string {
  return Array.from(secret)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Compute the HTLC hash commitment H = SHA256(secret).
 *
 * @param secret - 32-byte random secret
 * @returns 64-character hex string (32 bytes, no "0x" prefix)
 */
export async function hashHFromSecret(secret: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    secret.buffer as ArrayBuffer,
  );
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Result of creating an HTLC secret for a pegin.
 */
export interface HtlcSecretResult {
  /** The raw secret hex string (shown to the user, needed for activation/refund) */
  secretHex: string;
  /** H = SHA256(secret), the hash commitment for the HTLC (no 0x prefix) */
  hashH: string;
}

/**
 * Generate a new HTLC secret and its hash commitment.
 *
 * TODO: In the near future, this will be replaced by a wallet call
 * (the wallet will generate and manage the secret).
 *
 * @returns The secret hex and hash commitment
 */
export async function createHtlcSecret(): Promise<HtlcSecretResult> {
  const secret = generateHtlcSecret();
  const secretHex = secretToHex(secret);
  const hashH = await hashHFromSecret(secret);
  return { secretHex, hashH };
}

/**
 * Convert a hex string to Uint8Array for hashing.
 * Accepts with or without 0x prefix.
 */
function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
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
    secretBytes.buffer as ArrayBuffer,
  );
  const computedHash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const expectedHash = hashlock.startsWith("0x") ? hashlock.slice(2) : hashlock;

  return computedHash.toLowerCase() === expectedHash.toLowerCase();
}
