import type { HashMap } from "./types";

const CONNECTED_ACCOUNTS_KEY = "baby-connected-wallet-accounts";

/**
 * Factory method instantiates an instance of persistent key value storage with predefined ttl value
 * @param ttl - time to live in ms
 * @returns - key value storage
 */
export const createAccountStorage: (ttl: number) => HashMap = (ttl) => ({
  get: (key: string) => {
    const map = localStorage.getItem(CONNECTED_ACCOUNTS_KEY)
      ? JSON.parse(localStorage.getItem(CONNECTED_ACCOUNTS_KEY) || "{}")
      : {};

    if (map._timestamp && Date.now() - map._timestamp > ttl) {
      return undefined;
    }

    return map[key];
  },
  has: (key: string) => {
    const map = localStorage.getItem(CONNECTED_ACCOUNTS_KEY)
      ? JSON.parse(localStorage.getItem(CONNECTED_ACCOUNTS_KEY) || "{}")
      : {};

    if (map._timestamp && Date.now() - map._timestamp > ttl) {
      return false;
    }

    return Boolean(map[key]);
  },
  set: (key: string, value: any) => {
    const map = localStorage.getItem(CONNECTED_ACCOUNTS_KEY)
      ? JSON.parse(localStorage.getItem(CONNECTED_ACCOUNTS_KEY) || "{}")
      : {};

    map[key] = value;
    map._timestamp = Date.now();

    localStorage.setItem(CONNECTED_ACCOUNTS_KEY, JSON.stringify(map));
  },
  delete: (key: string) => {
    const map = localStorage.getItem(CONNECTED_ACCOUNTS_KEY)
      ? JSON.parse(localStorage.getItem(CONNECTED_ACCOUNTS_KEY) || "{}")
      : {};
    const deleted = Reflect.deleteProperty(map, key);
    localStorage.setItem(CONNECTED_ACCOUNTS_KEY, JSON.stringify(map));

    return deleted;
  },
});
