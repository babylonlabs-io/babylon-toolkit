/**
 * Encrypted mnemonic vault backed by localStorage.
 *
 * Uses `@metamask/browser-passworder` (AES-GCM + PBKDF2) to encrypt
 * the Lamport mnemonic with a user-chosen password before persisting
 * it in the browser. This allows the mnemonic to survive page reloads
 * while staying protected at rest.
 */

import { decrypt, encrypt } from "@metamask/browser-passworder";

/** localStorage key where the encrypted vault is stored. */
const STORAGE_KEY = "babylon-lamport-vault";

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
export async function hasStoredMnemonic(): Promise<boolean> {
  return safeGetItem(STORAGE_KEY) !== null;
}

/**
 * Encrypt and persist a mnemonic.
 *
 * @param mnemonic - The plaintext BIP-39 mnemonic.
 * @param password - User-chosen password used as the encryption key.
 */
export async function storeMnemonic(
  mnemonic: string,
  password: string,
): Promise<void> {
  const encrypted = await encrypt(password, { mnemonic });
  const vault: StoredVault = { encrypted };
  safeSetItem(STORAGE_KEY, JSON.stringify(vault));
}

/**
 * Decrypt and return the stored mnemonic.
 *
 * @param password - The password originally used to encrypt the vault.
 * @throws If no vault exists, the data is corrupted, or the password is wrong.
 */
export async function unlockMnemonic(password: string): Promise<string> {
  const raw = safeGetItem(STORAGE_KEY);
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

  const decrypted = (await decrypt(password, vault.encrypted)) as {
    mnemonic: string;
  };
  return decrypted.mnemonic;
}

/** Remove the encrypted vault from localStorage. */
export function clearStoredMnemonic(): void {
  safeRemoveItem(STORAGE_KEY);
}
