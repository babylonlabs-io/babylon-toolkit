/**
 * Encrypted mnemonic vault backed by localStorage.
 *
 * Uses `@metamask/browser-passworder` (AES-GCM + PBKDF2) to encrypt
 * the Lamport mnemonic with a user-chosen password before persisting
 * it in the browser. This allows the mnemonic to survive page reloads
 * while staying protected at rest.
 */

import { decrypt, encrypt } from "@metamask/browser-passworder";

/** Base localStorage key where the encrypted vault is stored. */
const STORAGE_KEY = "babylon-lamport-vault";

/**
 * Build the storage key, optionally scoped to a user identifier
 * (e.g. an ETH address). When no scope is provided the original
 * global key is used so existing stored mnemonics keep working.
 */
function storageKey(scope?: string): string {
  return scope ? `${STORAGE_KEY}-${scope}` : STORAGE_KEY;
}

/** Shape of the JSON blob persisted in localStorage. */
interface StoredVault {
  encrypted: string;
}

/** Read from localStorage, returning `null` if storage is unavailable. */
function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Write to localStorage, throwing a user-friendly error on failure. */
function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    throw new Error("Unable to save data. Storage may be disabled.");
  }
}

/** Remove a key from localStorage, silently ignoring errors. */
function safeRemoveItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // noop
  }
}

/** Check whether an encrypted mnemonic already exists in storage. */
export async function hasStoredMnemonic(scope?: string): Promise<boolean> {
  return safeGetItem(storageKey(scope)) !== null;
}

/**
 * Encrypt and persist a mnemonic.
 *
 * @param mnemonic - The plaintext BIP-39 mnemonic.
 * @param password - User-chosen password used as the encryption key.
 * @param scope    - Optional user identifier (e.g. ETH address) to isolate storage.
 */
export async function storeMnemonic(
  mnemonic: string,
  password: string,
  scope?: string,
): Promise<void> {
  const encrypted = await encrypt(password, { mnemonic });
  const vault: StoredVault = { encrypted };
  safeSetItem(storageKey(scope), JSON.stringify(vault));
}

/**
 * Decrypt and return the stored mnemonic.
 *
 * @param password - The password originally used to encrypt the vault.
 * @param scope    - Optional user identifier (e.g. ETH address) to isolate storage.
 * @throws If no vault exists, the data is corrupted, or the password is wrong.
 */
export async function unlockMnemonic(
  password: string,
  scope?: string,
): Promise<string> {
  const raw = safeGetItem(storageKey(scope));
  if (!raw) {
    throw new Error("No stored mnemonic found");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Stored mnemonic data is corrupted");
  }
  const vault = parsed as Partial<StoredVault> | null;
  if (!vault || typeof vault.encrypted !== "string") {
    throw new Error("Stored mnemonic data is corrupted");
  }

  const decrypted: unknown = await decrypt(password, vault.encrypted);
  if (
    typeof decrypted !== "object" ||
    decrypted === null ||
    typeof (decrypted as Record<string, unknown>).mnemonic !== "string"
  ) {
    throw new Error("Decrypted data does not contain a valid mnemonic");
  }
  return (decrypted as { mnemonic: string }).mnemonic;
}

/** Remove the encrypted vault from localStorage. */
export function clearStoredMnemonic(scope?: string): void {
  safeRemoveItem(storageKey(scope));
}
