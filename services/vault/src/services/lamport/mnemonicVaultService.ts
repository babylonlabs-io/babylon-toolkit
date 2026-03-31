/**
 * @module mnemonicVaultService
 *
 * Encrypted mnemonic vault backed by localStorage.
 *
 * Supports multiple mnemonics per scope with a peg-in mapping table
 * that tracks which mnemonic was used for each peg-in. Uses
 * `@metamask/browser-passworder` (AES-GCM + PBKDF2) to encrypt
 * each mnemonic with a user-chosen password before persisting.
 *
 * ## Storage format
 *
 * ```
 * key: "babylon-lamport-vault" | "babylon-lamport-vault-{scope}"
 * value: {
 *   mnemonics: [{ id: "uuid", encrypted: "..." }, ...],
 *   peginMap: { "peginTxHash": "mnemonicUuid", ... },
 *   activeMnemonicId: "uuid" | null,
 *   passwordCheck: "encrypted-sentinel" | null
 * }
 * ```
 *
 * - `mnemonics` — Array of encrypted mnemonic entries, each with a
 *   random UUID assigned at creation time.
 * - `peginMap` — Maps peg-in transaction hashes to mnemonic UUIDs so
 *   the correct mnemonic can be resolved when resuming a deposit.
 * - `activeMnemonicId` — The UUID of the most recently added or
 *   matched mnemonic, used as the default for new deposits.
 * - `passwordCheck` — A sentinel value encrypted with the vault
 *   password. Used to verify the password on subsequent calls to
 *   {@link addMnemonic} so that all entries stay encrypted with the
 *   same password. If the user loses their password, they must clear
 *   the vault via {@link clearStoredMnemonic} and re-import.
 *
 * ## Scope
 *
 * All functions accept an optional `scope` parameter (typically an
 * ETH address) that isolates the vault in localStorage. When omitted,
 * the global key `"babylon-lamport-vault"` is used.
 */

import { decrypt, encrypt } from "@metamask/browser-passworder";

import { logger } from "@/infrastructure";
import { stripHexPrefix } from "@/utils/btc";

/**
 * Error thrown when the vault integrity check fails, indicating that
 * vault data in localStorage may have been tampered with.
 */
export class VaultTamperingError extends Error {
  constructor() {
    super(
      "Vault integrity check failed — data may have been tampered with. " +
        "Clear the vault and re-import your mnemonic.",
    );
    this.name = "VaultTamperingError";
  }
}

/** Base localStorage key where the encrypted vault is stored. */
const STORAGE_KEY = "babylon-lamport-vault";

/**
 * Known plaintext encrypted with the vault password to verify that
 * subsequent {@link addMnemonic} calls use the same password.
 */
const PASSWORD_CHECK_SENTINEL = "babylon-vault-ok";

/**
 * Build the full localStorage key, optionally scoped to a user
 * identifier (e.g. an ETH address).
 *
 * @param scope - Optional user identifier to isolate storage.
 * @returns The localStorage key string.
 */
function storageKey(scope?: string): string {
  return scope ? `${STORAGE_KEY}-${scope.toLowerCase()}` : STORAGE_KEY;
}

/** A single encrypted mnemonic entry stored in the vault. */
interface MnemonicEntry {
  /** Random UUID assigned when the mnemonic is first added. */
  id: string;
  /** AES-GCM ciphertext produced by `@metamask/browser-passworder`. */
  encrypted: string;
}

/** Shape of the multi-mnemonic vault persisted in localStorage. */
interface MultiMnemonicVault {
  /** All encrypted mnemonic entries for this scope. */
  mnemonics: MnemonicEntry[];
  /** Maps peg-in tx hashes to mnemonic UUIDs. */
  peginMap: Record<string, string>;
  /** UUID of the most recently added/matched mnemonic. */
  activeMnemonicId: string | null;
  /**
   * Sentinel value encrypted with the vault password. Used to verify
   * that the same password is provided on every {@link addMnemonic}
   * call. `null` when the vault has no entries yet.
   */
  passwordCheck: string | null;
  /**
   * Encrypted SHA-256 hash of the canonical vault payload, used to
   * detect tampering of structural fields (mnemonics, activeMnemonicId,
   * passwordCheck). `null` for legacy vaults created before this field
   * was introduced.
   *
   * Note: `peginMap` is excluded from the integrity hash because
   * {@link linkPeginToMnemonic} writes to it without the password.
   * peginMap tampering is a recoverable DoS (VP rejects wrong key).
   */
  integrityTag: string | null;
}

/**
 * Read from localStorage, returning `null` if storage is
 * unavailable or the key does not exist.
 *
 * @param key - The localStorage key to read.
 * @returns The stored string value, or `null`.
 */
function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Write to localStorage, throwing a user-friendly error on failure.
 *
 * @param key   - The localStorage key.
 * @param value - The string value to persist.
 * @throws If localStorage is unavailable or the quota is exceeded.
 */
function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    throw new Error("Unable to save data. Storage may be disabled.");
  }
}

/**
 * Remove a key from localStorage, silently ignoring errors.
 *
 * @param key - The localStorage key to remove.
 */
function safeRemoveItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // noop
  }
}

/**
 * Compute the SHA-256 hex digest of a string using the Web Crypto API.
 */
async function sha256Hex(data: string): Promise<string> {
  const encoded = new TextEncoder().encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  const bytes = new Uint8Array(hashBuffer);
  let hex = "";
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Produce a deterministic JSON string of the vault fields covered by
 * the integrity tag. Key order is fixed by constructing a fresh object.
 *
 * `peginMap` is deliberately excluded — see {@link MultiMnemonicVault.integrityTag}.
 */
function canonicalVaultPayload(vault: MultiMnemonicVault): string {
  return JSON.stringify({
    mnemonics: vault.mnemonics.map((m) => ({
      id: m.id,
      encrypted: m.encrypted,
    })),
    activeMnemonicId: vault.activeMnemonicId,
    passwordCheck: vault.passwordCheck,
  });
}

/**
 * Compute an integrity tag for the vault by hashing the canonical
 * payload and encrypting the hash with the vault password.
 */
async function computeIntegrityTag(
  vault: MultiMnemonicVault,
  password: string,
): Promise<string> {
  const hash = await sha256Hex(canonicalVaultPayload(vault));
  return encrypt(password, hash);
}

/**
 * Verify the vault's integrity tag. Throws {@link VaultTamperingError}
 * if the stored tag does not match the current vault state.
 *
 * Skips verification for legacy vaults where `integrityTag` is `null`.
 */
async function verifyIntegrityTag(
  vault: MultiMnemonicVault,
  password: string,
): Promise<void> {
  if (vault.integrityTag === null) return;

  let storedHash: unknown;
  try {
    storedHash = await decrypt(password, vault.integrityTag);
  } catch {
    // If passwordCheck is absent (pre-passwordCheck vault), we cannot
    // distinguish a wrong password from actual tampering — surface as
    // a password error to avoid misleading the user.
    if (!vault.passwordCheck) {
      throw new Error("Incorrect vault password");
    }
    throw new VaultTamperingError();
  }

  const expectedHash = await sha256Hex(canonicalVaultPayload(vault));
  if (storedHash !== expectedHash) {
    throw new VaultTamperingError();
  }
}

/**
 * Generate a random UUID (v4) for use as a mnemonic entry identifier.
 *
 * @returns A new UUID string.
 */
function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Type guard that checks whether a parsed JSON value conforms to the
 * {@link MultiMnemonicVault} shape.
 *
 * @param parsed - The value to check.
 * @returns `true` if the value has a `mnemonics` array.
 */
function isMultiVault(parsed: unknown): parsed is MultiMnemonicVault {
  if (typeof parsed !== "object" || parsed === null) return false;
  const obj = parsed as Record<string, unknown>;

  // Must have mnemonics array
  if (!Array.isArray(obj.mnemonics)) return false;

  // Each entry must have id (string) and encrypted (string)
  for (const entry of obj.mnemonics as unknown[]) {
    if (typeof entry !== "object" || entry === null) return false;
    const e = entry as Record<string, unknown>;
    if (typeof e.id !== "string" || typeof e.encrypted !== "string") {
      return false;
    }
  }

  // peginMap must be a plain object (not null, not array)
  if (
    typeof obj.peginMap !== "object" ||
    obj.peginMap === null ||
    Array.isArray(obj.peginMap)
  ) {
    return false;
  }

  // activeMnemonicId: string | null
  if (
    obj.activeMnemonicId !== null &&
    obj.activeMnemonicId !== undefined &&
    typeof obj.activeMnemonicId !== "string"
  ) {
    return false;
  }

  // passwordCheck: string | null
  if (
    obj.passwordCheck !== null &&
    obj.passwordCheck !== undefined &&
    typeof obj.passwordCheck !== "string"
  ) {
    return false;
  }

  return true;
}

/**
 * Read and parse the vault from localStorage for the given scope.
 *
 * @param scope - Optional user identifier to isolate storage.
 * @returns The parsed vault, or `null` if absent / corrupted.
 */
function readVault(scope?: string): MultiMnemonicVault | null {
  const raw = safeGetItem(storageKey(scope));
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isMultiVault(parsed)) return null;

  // Normalize integrityTag for legacy vaults that predate this field
  return {
    mnemonics: parsed.mnemonics,
    peginMap: parsed.peginMap,
    activeMnemonicId: parsed.activeMnemonicId ?? null,
    passwordCheck: parsed.passwordCheck ?? null,
    integrityTag: parsed.integrityTag ?? null,
  };
}

/**
 * Serialize and persist the vault to localStorage.
 *
 * @param vault - The vault object to write.
 * @param scope - Optional user identifier to isolate storage.
 */
function writeVault(vault: MultiMnemonicVault, scope?: string): void {
  safeSetItem(storageKey(scope), JSON.stringify(vault));
}

/**
 * Create an empty vault with no mnemonics and no mappings.
 *
 * @returns A fresh {@link MultiMnemonicVault}.
 */
function emptyVault(): MultiMnemonicVault {
  return {
    mnemonics: [],
    peginMap: {},
    activeMnemonicId: null,
    passwordCheck: null,
    integrityTag: null,
  };
}

/**
 * Decrypt a single mnemonic entry using the provided password.
 *
 * @param entry    - The encrypted mnemonic entry.
 * @param password - The password used to encrypt the entry.
 * @returns The plaintext mnemonic string.
 * @throws If the password is wrong or the decrypted payload is malformed.
 */
async function decryptEntry(
  entry: MnemonicEntry,
  password: string,
): Promise<string> {
  const decrypted: unknown = await decrypt(password, entry.encrypted);
  if (
    typeof decrypted !== "object" ||
    decrypted === null ||
    typeof (decrypted as Record<string, unknown>).mnemonic !== "string"
  ) {
    throw new Error("Decrypted data does not contain a valid mnemonic");
  }
  return (decrypted as { mnemonic: string }).mnemonic;
}

/**
 * Check whether any encrypted mnemonic exists in storage for the
 * given scope.
 *
 * @param scope - Optional user identifier to isolate storage.
 * @returns `true` if at least one mnemonic is stored.
 */
export async function hasStoredMnemonic(scope?: string): Promise<boolean> {
  const vault = readVault(scope);
  return vault !== null && vault.mnemonics.length > 0;
}

/**
 * Add a mnemonic to the vault. If the same mnemonic already exists
 * (verified by decrypting each stored entry), returns the existing
 * entry's ID instead of creating a duplicate. Otherwise encrypts and
 * appends a new entry. The active mnemonic is always updated to the
 * added or matched entry.
 *
 * @param mnemonic - The plaintext BIP-39 mnemonic to store.
 * @param password - User-chosen password used as the encryption key.
 * @param scope    - Optional user identifier (e.g. ETH address) to
 *                   isolate storage.
 * @returns The UUID of the mnemonic entry (new or existing).
 */
export async function addMnemonic(
  mnemonic: string,
  password: string,
  scope?: string,
): Promise<string> {
  const vault = readVault(scope) ?? emptyVault();

  if (vault.passwordCheck) {
    try {
      await decrypt(password, vault.passwordCheck);
    } catch {
      throw new Error("Incorrect vault password");
    }
  }

  // Verify integrity before trusting vault contents
  await verifyIntegrityTag(vault, password);

  for (const entry of vault.mnemonics) {
    try {
      const existing = await decryptEntry(entry, password);
      if (existing === mnemonic) {
        vault.activeMnemonicId = entry.id;
        vault.integrityTag = await computeIntegrityTag(vault, password);
        writeVault(vault, scope);
        return entry.id;
      }
    } catch {
      logger.warn(
        `[mnemonicVault] Skipping corrupted mnemonic entry: ${entry.id}`,
      );
    }
  }

  if (!vault.passwordCheck) {
    vault.passwordCheck = await encrypt(password, PASSWORD_CHECK_SENTINEL);
  }

  const id = generateId();
  const encrypted = await encrypt(password, { mnemonic });
  vault.mnemonics.push({ id, encrypted });
  vault.activeMnemonicId = id;
  vault.integrityTag = await computeIntegrityTag(vault, password);
  writeVault(vault, scope);
  return id;
}

/**
 * Decrypt and return a stored mnemonic.
 *
 * When `mnemonicId` is provided the specific entry is unlocked.
 * Otherwise the active mnemonic (most recently added/matched) is
 * used, falling back to the first entry if no active ID is set.
 *
 * @param password   - The password originally used to encrypt the vault.
 * @param scope      - Optional user identifier to isolate storage.
 * @param mnemonicId - UUID of a specific mnemonic to unlock. When
 *                     omitted the active mnemonic is used.
 * @returns The plaintext mnemonic string.
 * @throws If no vault exists, the entry is not found, or the password
 *         is incorrect.
 */
export async function unlockMnemonic(
  password: string,
  scope?: string,
  mnemonicId?: string,
): Promise<string> {
  const vault = readVault(scope);
  if (!vault || vault.mnemonics.length === 0) {
    throw new Error("No stored mnemonic found");
  }

  // Verify password before integrity check so a wrong password
  // throws "Incorrect vault password" rather than VaultTamperingError
  if (vault.passwordCheck) {
    try {
      await decrypt(password, vault.passwordCheck);
    } catch {
      throw new Error("Incorrect vault password");
    }
  }

  // Verify integrity before trusting vault contents
  await verifyIntegrityTag(vault, password);

  const targetId = mnemonicId ?? vault.activeMnemonicId;
  const entry = targetId
    ? vault.mnemonics.find((m) => m.id === targetId)
    : vault.mnemonics[0];

  if (!entry) {
    throw new Error("Mnemonic not found in vault");
  }

  const result = await decryptEntry(entry, password);

  // Migrate legacy vaults AFTER confirming the password is correct
  // (decryptEntry succeeded). Writing before would brick the vault if
  // a wrong password is supplied on a passwordCheck-less vault.
  if (vault.integrityTag === null) {
    vault.integrityTag = await computeIntegrityTag(vault, password);
    writeVault(vault, scope);
  }

  return result;
}

/**
 * Record which mnemonic was used for a given peg-in. The mapping is
 * stored unencrypted since both the peg-in ID and mnemonic UUID are
 * non-sensitive identifiers.
 *
 * @param peginId    - The peg-in transaction hash (with or without
 *                     `0x` prefix).
 * @param mnemonicId - UUID of the mnemonic entry used for this peg-in.
 * @param scope      - Optional user identifier to isolate storage.
 */
export function linkPeginToMnemonic(
  peginId: string,
  mnemonicId: string,
  scope?: string,
): void {
  const vault = readVault(scope);
  if (!vault) {
    logger.warn(
      "[mnemonicVault] linkPeginToMnemonic: no vault exists for scope, skipping",
    );
    return;
  }
  vault.peginMap[stripHexPrefix(peginId)] = mnemonicId;
  writeVault(vault, scope);
}

/**
 * Look up which mnemonic UUID is associated with a peg-in.
 *
 * @param peginId - The peg-in transaction hash.
 * @param scope   - Optional user identifier to isolate storage.
 * @returns The mnemonic UUID, or `null` if no mapping exists.
 */
export function getMnemonicIdForPegin(
  peginId: string,
  scope?: string,
): string | null {
  const vault = readVault(scope);
  return vault?.peginMap[stripHexPrefix(peginId)] ?? null;
}

/**
 * Check whether a specific mnemonic UUID exists in the vault
 * (without decrypting). Used by the resume flow to verify the
 * mapped mnemonic is still present before prompting for a password.
 *
 * @param mnemonicId - The UUID to look for.
 * @param scope      - Optional user identifier to isolate storage.
 * @returns `true` if an entry with that UUID exists.
 */
export function hasMnemonicEntry(mnemonicId: string, scope?: string): boolean {
  const vault = readVault(scope);
  if (!vault) return false;
  return vault.mnemonics.some((m) => m.id === mnemonicId);
}

/**
 * Return the active mnemonic UUID for the given scope.
 *
 * The active mnemonic is the one most recently added or matched by
 * {@link addMnemonic}, and is used as the default for new deposits.
 *
 * @param scope - Optional user identifier to isolate storage.
 * @returns The active mnemonic UUID, or `null` if no vault exists.
 */
export function getActiveMnemonicId(scope?: string): string | null {
  const vault = readVault(scope);
  return vault?.activeMnemonicId ?? null;
}

/**
 * Remove the entire encrypted vault from localStorage for the given
 * scope. This deletes all mnemonics and peg-in mappings.
 *
 * @param scope - Optional user identifier to isolate storage.
 */
export function clearStoredMnemonic(scope?: string): void {
  safeRemoveItem(storageKey(scope));
}
