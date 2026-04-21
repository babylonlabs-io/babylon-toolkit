import { test, expect } from "@playwright/test";

import { createAccountStorage } from "../../src/core/storage";

const ONE_HOUR_MS = 3600_000;
const STORAGE_KEY = "baby-connected-wallet-accounts";

/**
 * Minimal localStorage polyfill for Node (Playwright unit tests run outside the browser).
 */
function polyfillLocalStorage() {
  if (typeof globalThis.localStorage !== "undefined") return;

  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    get length() { return store.size; },
    key: (index: number) => [...store.keys()][index] ?? null,
  };
}

polyfillLocalStorage();

let origDateNow: typeof Date.now;

test.beforeEach(() => {
  localStorage.clear();
  origDateNow = Date.now;
});

test.afterEach(() => {
  Date.now = origDateNow;
  localStorage.clear();
});

test("per-entry TTL: expired BTC does not affect fresh ETH", () => {
  const baseTime = 1_000_000_000_000;
  Date.now = () => baseTime;

  const storage = createAccountStorage(ONE_HOUR_MS);
  storage.set("BTC", "btc-wallet-1");

  Date.now = () => baseTime + ONE_HOUR_MS + 1;
  storage.set("ETH", "eth-wallet-1");

  expect(storage.get("BTC")).toBeUndefined();
  expect(storage.has("BTC")).toBe(false);
  expect(storage.get("ETH")).toBe("eth-wallet-1");
  expect(storage.has("ETH")).toBe(true);
});

test("per-entry TTL: updating an entry refreshes only its timestamp", () => {
  const baseTime = 1_000_000_000_000;
  Date.now = () => baseTime;

  const storage = createAccountStorage(ONE_HOUR_MS);
  storage.set("BTC", "btc-wallet-1");
  storage.set("ETH", "eth-wallet-1");

  // Advance to near expiry and refresh only BTC
  const almostExpired = baseTime + ONE_HOUR_MS - 100;
  Date.now = () => almostExpired;
  storage.set("BTC", "btc-wallet-2");

  // Advance past original TTL but within BTC's refreshed TTL
  Date.now = () => almostExpired + 200;

  expect(storage.get("BTC")).toBe("btc-wallet-2");
  expect(storage.get("ETH")).toBeUndefined();
});

test("delete removes entry and its timestamp", () => {
  const storage = createAccountStorage(ONE_HOUR_MS);

  storage.set("BTC", "btc-wallet-1");
  storage.delete("BTC");

  expect(storage.get("BTC")).toBeUndefined();
  expect(storage.has("BTC")).toBe(false);
});

test("entry without timestamp is treated as expired", () => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ BTC: "btc-wallet-old" }),
  );

  const storage = createAccountStorage(ONE_HOUR_MS);

  expect(storage.get("BTC")).toBeUndefined();
  expect(storage.has("BTC")).toBe(false);
});

test("network-scoped keys have independent TTLs", () => {
  const baseTime = 1_000_000_000_000;
  Date.now = () => baseTime;

  const networkMap = { BTC: "mainnet", ETH: "1" };
  const storage = createAccountStorage(ONE_HOUR_MS, networkMap);
  storage.set("BTC", "btc-wallet-1");

  Date.now = () => baseTime + ONE_HOUR_MS + 1;
  storage.set("ETH", "eth-wallet-1");

  expect(storage.get("BTC")).toBeUndefined();
  expect(storage.get("ETH")).toBe("eth-wallet-1");
});
