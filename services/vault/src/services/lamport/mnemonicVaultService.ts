import { decrypt, encrypt } from "@metamask/browser-passworder";

const STORAGE_KEY = "babylon-lamport-vault";

interface StoredVault {
  encrypted: string;
}

function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    throw new Error("Unable to save data. Storage may be disabled.");
  }
}

function safeRemoveItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // noop
  }
}

export async function hasStoredMnemonic(): Promise<boolean> {
  return safeGetItem(STORAGE_KEY) !== null;
}

export async function storeMnemonic(
  mnemonic: string,
  password: string,
): Promise<void> {
  const encrypted = await encrypt(password, { mnemonic });
  const vault: StoredVault = { encrypted };
  safeSetItem(STORAGE_KEY, JSON.stringify(vault));
}

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

export function clearStoredMnemonic(): void {
  safeRemoveItem(STORAGE_KEY);
}
