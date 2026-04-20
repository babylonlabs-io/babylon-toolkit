import { test, expect } from "@playwright/test";

import { createAccountStorage } from "../../src/core/storage";

const ONE_HOUR_MS = 3600_000;

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

test.beforeEach(() => {
  localStorage.clear();
});

test.afterEach(() => {
  localStorage.clear();
});

test("per-entry TTL: expired BTC does not affect fresh ETH", () => {
  const storage = createAccountStorage(ONE_HOUR_MS);

  const now = Date.now();
  storage.set("BTC", "btc-wallet-1");

  const origDateNow = Date.now;
  Date.now = () => now + ONE_HOUR_MS + 1;

  storage.set("ETH", "eth-wallet-1");

  expect(storage.get("BTC")).toBeUndefined();
  expect(storage.has("BTC")).toBe(false);
  expect(storage.get("ETH")).toBe("eth-wallet-1");
  expect(storage.has("ETH")).toBe(true);

  Date.now = origDateNow;
});

test("per-entry TTL: updating an entry refreshes only its timestamp", () => {
  const storage = createAccountStorage(ONE_HOUR_MS);

  const now = Date.now();
  storage.set("BTC", "btc-wallet-1");
  storage.set("ETH", "eth-wallet-1");

  const origDateNow = Date.now;

  // Advance to near expiry and refresh only BTC
  const almostExpired = now + ONE_HOUR_MS - 100;
  Date.now = () => almostExpired;
  storage.set("BTC", "btc-wallet-2");

  // Advance past original TTL but within BTC's refreshed TTL
  Date.now = () => almostExpired + 200;

  expect(storage.get("BTC")).toBe("btc-wallet-2");
  expect(storage.get("ETH")).toBeUndefined();

  Date.now = origDateNow;
});

test("delete removes entry and its timestamp", () => {
  const storage = createAccountStorage(ONE_HOUR_MS);

  storage.set("BTC", "btc-wallet-1");
  storage.delete("BTC");

  expect(storage.get("BTC")).toBeUndefined();
  expect(storage.has("BTC")).toBe(false);
});

test("legacy _timestamp format expires correctly after migration", () => {
  const now = Date.now();

  // Simulate old-format data written before migration (single _timestamp)
  localStorage.setItem(
    "baby-connected-wallet-accounts",
    JSON.stringify({ BTC: "btc-wallet-old", _timestamp: now - ONE_HOUR_MS - 1 }),
  );

  const storage = createAccountStorage(ONE_HOUR_MS);

  // Legacy entry should be expired based on the old shared timestamp
  expect(storage.get("BTC")).toBeUndefined();
  expect(storage.has("BTC")).toBe(false);
});

test("legacy _timestamp format keeps fresh entries alive", () => {
  const now = Date.now();

  // Simulate old-format data that is still fresh
  localStorage.setItem(
    "baby-connected-wallet-accounts",
    JSON.stringify({ BTC: "btc-wallet-old", _timestamp: now - 100 }),
  );

  const storage = createAccountStorage(ONE_HOUR_MS);

  expect(storage.get("BTC")).toBe("btc-wallet-old");
  expect(storage.has("BTC")).toBe(true);
});

test("network-scoped keys have independent TTLs", () => {
  const networkMap = { BTC: "mainnet", ETH: "1" };
  const storage = createAccountStorage(ONE_HOUR_MS, networkMap);

  const now = Date.now();
  storage.set("BTC", "btc-wallet-1");

  const origDateNow = Date.now;
  Date.now = () => now + ONE_HOUR_MS + 1;

  storage.set("ETH", "eth-wallet-1");

  expect(storage.get("BTC")).toBeUndefined();
  expect(storage.get("ETH")).toBe("eth-wallet-1");

  Date.now = origDateNow;
});
