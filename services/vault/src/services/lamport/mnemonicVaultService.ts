import { decrypt, encrypt } from "@metamask/browser-passworder";

const STORAGE_KEY = "babylon-lamport-vault";

interface StoredVault {
  encrypted: string;
}

export async function hasStoredMnemonic(): Promise<boolean> {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw !== null;
}

export async function storeMnemonic(
  mnemonic: string,
  password: string,
): Promise<void> {
  const encrypted = await encrypt(password, { mnemonic });
  const vault: StoredVault = { encrypted };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(vault));
}

export async function unlockMnemonic(password: string): Promise<string> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    throw new Error("No stored mnemonic found");
  }

  const vault: StoredVault = JSON.parse(raw);
  const decrypted = await decrypt<{ mnemonic: string }>(
    password,
    vault.encrypted,
  );
  return decrypted.mnemonic;
}

export function clearStoredMnemonic(): void {
  localStorage.removeItem(STORAGE_KEY);
}
