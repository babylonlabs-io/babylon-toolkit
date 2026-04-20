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
export const createAccountStorage = (ttl: number, networkMap?: Record<string, string>): HashMap => {
  function getTimestamps(map: Record<string, unknown>): Record<string, number> {
    const timestamps = map._timestamps;
    if (timestamps && typeof timestamps === "object" && !Array.isArray(timestamps)) {
      return timestamps as Record<string, number>;
    }
    return {};
  }

  function isExpired(map: Record<string, unknown>, scoped: string): boolean {
    const timestamps = getTimestamps(map);
    const ts = timestamps[scoped];
    if (ts != null) {
      return Date.now() - ts > ttl;
    }
    // Fall back to legacy shared timestamp for entries written before migration
    const legacyTs = map._timestamp;
    if (typeof legacyTs === "number") {
      return Date.now() - legacyTs > ttl;
    }
    // No timestamp at all — treat as expired
    return true;
  }

  return {
    get: (key: string) => {
      const map = readAccountsMap();
      const scoped = scopeKey(key, networkMap);

      if (isExpired(map, scoped)) {
        return undefined;
      }

      return map[scoped] as string | undefined;
    },
    has: (key: string) => {
      const map = readAccountsMap();
      const scoped = scopeKey(key, networkMap);

      if (isExpired(map, scoped)) {
        return false;
      }

      return Boolean(map[scoped]);
    },
    set: (key: string, value: string) => {
      const map = readAccountsMap();
      const scoped = scopeKey(key, networkMap);
      const timestamps = getTimestamps(map);

      map[scoped] = value;
      map._timestamps = { ...timestamps, [scoped]: Date.now() };
      writeAccountsMap(map);
    },
    delete: (key: string) => {
      const map = readAccountsMap();
      const scoped = scopeKey(key, networkMap);
      const timestamps = getTimestamps(map);

      const deleted = Reflect.deleteProperty(map, scoped);
      delete timestamps[scoped];
      map._timestamps = timestamps;
      writeAccountsMap(map);
      return deleted;
    },
  };
};
