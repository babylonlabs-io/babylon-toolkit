import type { HashMap } from "./types";

const CONNECTED_ACCOUNTS_KEY = "baby-connected-wallet-accounts";

/**
 * Safely reads and parses the connected accounts map from localStorage.
 * On parse failure (corrupted data), clears the corrupted entry and returns an empty map.
 */
function readAccountsMap(): Record<string, unknown> {
  const raw = localStorage.getItem(CONNECTED_ACCOUNTS_KEY);
  if (!raw) return {};

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      localStorage.removeItem(CONNECTED_ACCOUNTS_KEY);
      return {};
    }
    return parsed as Record<string, unknown>;
  } catch (e) {
    console.error("[account-storage] Failed to parse accounts map, clearing corrupted entry:", e);
    localStorage.removeItem(CONNECTED_ACCOUNTS_KEY);
    return {};
  }
}

/**
 * Safely writes the accounts map to localStorage.
 * On write failure (quota exceeded, serialization error), clears the entry to avoid stale state.
 */
function writeAccountsMap(map: Record<string, unknown>): void {
  try {
    localStorage.setItem(CONNECTED_ACCOUNTS_KEY, JSON.stringify(map));
  } catch (e) {
    console.error("[account-storage] Failed to write accounts map, clearing entry:", e);
    localStorage.removeItem(CONNECTED_ACCOUNTS_KEY);
  }
}

/**
 * Factory method instantiates an instance of persistent key value storage with predefined ttl value
 * @param ttl - time to live in ms
 * @returns - key value storage
 */
export const createAccountStorage: (ttl: number) => HashMap = (ttl) => ({
  get: (key: string) => {
    const map = readAccountsMap();

    if (map._timestamp && Date.now() - (map._timestamp as number) > ttl) {
      return undefined;
    }

    return map[key] as string | undefined;
  },
  has: (key: string) => {
    const map = readAccountsMap();

    if (map._timestamp && Date.now() - (map._timestamp as number) > ttl) {
      return false;
    }

    return Boolean(map[key]);
  },
  set: (key: string, value: any) => {
    const map = readAccountsMap();
    map[key] = value;
    map._timestamp = Date.now();
    writeAccountsMap(map);
  },
  delete: (key: string) => {
    const map = readAccountsMap();
    const deleted = Reflect.deleteProperty(map, key);
    writeAccountsMap(map);
    return deleted;
  },
});
