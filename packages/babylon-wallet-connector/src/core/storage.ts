import type { HashMap } from "./types";

const CONNECTED_ACCOUNTS_KEY = "baby-connected-wallet-accounts";

/**
 * Scopes a chain key with its network identifier so that persisted
 * wallet connections from one network are not auto-restored on another.
 * e.g. "BTC" with network "mainnet" → "BTC:mainnet"
 */
function scopeKey(key: string, networkMap?: Record<string, string>): string {
  const network = networkMap?.[key];
  return network ? `${key}:${network}` : key;
}

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
 * @param networkMap - maps chain IDs to their network identifiers (e.g. { BTC: "mainnet", ETH: "1" })
 *                     so entries are scoped per-network and won't cross-restore on network changes
 * @returns - key value storage
 */
export const createAccountStorage = (ttl: number, networkMap?: Record<string, string>): HashMap => ({
  get: (key: string) => {
    const map = readAccountsMap();

    if (map._timestamp && Date.now() - (map._timestamp as number) > ttl) {
      return undefined;
    }

    return map[scopeKey(key, networkMap)] as string | undefined;
  },
  has: (key: string) => {
    const map = readAccountsMap();

    if (map._timestamp && Date.now() - (map._timestamp as number) > ttl) {
      return false;
    }

    return Boolean(map[scopeKey(key, networkMap)]);
  },
  set: (key: string, value: string) => {
    const map = readAccountsMap();
    map[scopeKey(key, networkMap)] = value;
    map._timestamp = Date.now();
    writeAccountsMap(map);
  },
  delete: (key: string) => {
    const map = readAccountsMap();
    const deleted = Reflect.deleteProperty(map, scopeKey(key, networkMap));
    writeAccountsMap(map);
    return deleted;
  },
});
