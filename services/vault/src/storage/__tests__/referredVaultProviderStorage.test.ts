import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const STORAGE_KEY = "tbv-referred-vault-provider";
const PROVIDER = "0xaf8d9d665f4e27f3966a074dce5c50684bfbe358";
const OTHER_PROVIDER = "0x1234567890abcdef1234567890abcdef12345678";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** Load the module as a new page load would, with the stored record read fresh. */
async function loadPage() {
  vi.resetModules();
  return import("../referredVaultProviderStorage");
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  vi.useRealTimers();
});

describe("referredVaultProviderStorage", () => {
  it("returns the provider a link stored, in lowercase", async () => {
    const storage = await loadPage();

    storage.setReferredVaultProvider(
      "0xaf8d9D665f4e27F3966a074DCE5c50684BFBE358",
    );

    expect(storage.getReferredVaultProvider()).toBe(PROVIDER);
  });

  it("keeps the referral across a page load", async () => {
    const firstLoad = await loadPage();
    firstLoad.setReferredVaultProvider(PROVIDER);

    const secondLoad = await loadPage();

    expect(secondLoad.getReferredVaultProvider()).toBe(PROVIDER);
  });

  it("stops applying the referral 30 days after the visitor landed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-01T00:00:00Z"));
    const storage = await loadPage();
    storage.setReferredVaultProvider(PROVIDER);

    vi.advanceTimersByTime(THIRTY_DAYS_MS - 1);
    expect(storage.getReferredVaultProvider()).toBe(PROVIDER);

    vi.advanceTimersByTime(1);
    expect(storage.getReferredVaultProvider()).toBeNull();
  });

  it("restarts the 30 days when the visitor lands through a link again", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-01T00:00:00Z"));
    const storage = await loadPage();
    storage.setReferredVaultProvider(PROVIDER);

    vi.advanceTimersByTime(THIRTY_DAYS_MS - 1);
    storage.setReferredVaultProvider(PROVIDER);
    vi.advanceTimersByTime(THIRTY_DAYS_MS - 1);

    expect(storage.getReferredVaultProvider()).toBe(PROVIDER);
  });

  it("replaces the referral with the provider a newer link names", async () => {
    const storage = await loadPage();
    storage.setReferredVaultProvider(PROVIDER);

    storage.setReferredVaultProvider(OTHER_PROVIDER);

    expect(storage.getReferredVaultProvider()).toBe(OTHER_PROVIDER);
  });

  it("ignores a stored record of an unknown version", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 2, address: PROVIDER, savedAt: Date.now() }),
    );

    const storage = await loadPage();

    expect(storage.getReferredVaultProvider()).toBeNull();
  });

  it("ignores a stored value that is not JSON", async () => {
    localStorage.setItem(STORAGE_KEY, "{not json");

    const storage = await loadPage();

    expect(storage.getReferredVaultProvider()).toBeNull();
  });

  it("ignores a stored record whose address is not an address", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, address: "figment", savedAt: Date.now() }),
    );

    const storage = await loadPage();

    expect(storage.getReferredVaultProvider()).toBeNull();
  });

  it("ignores a stored record whose timestamp is not a number", async () => {
    // A numeric string, which arithmetic would otherwise accept as a time.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        address: PROVIDER,
        savedAt: String(Date.now()),
      }),
    );

    const storage = await loadPage();

    expect(storage.getReferredVaultProvider()).toBeNull();
  });

  it("treats a timestamp in the future as expired", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        address: PROVIDER,
        savedAt: Date.now() + THIRTY_DAYS_MS,
      }),
    );

    const storage = await loadPage();

    expect(storage.getReferredVaultProvider()).toBeNull();
  });

  it("clears the referral when a deposit starts with another provider", async () => {
    const storage = await loadPage();
    storage.setReferredVaultProvider(PROVIDER);

    storage.clearReferredVaultProviderIfOther(OTHER_PROVIDER);

    expect(storage.getReferredVaultProvider()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("keeps the referral when a deposit starts with the referred provider in any letter case", async () => {
    const storage = await loadPage();
    storage.setReferredVaultProvider(PROVIDER);

    storage.clearReferredVaultProviderIfOther(
      "0xaf8d9D665f4e27F3966a074DCE5c50684BFBE358",
    );

    expect(storage.getReferredVaultProvider()).toBe(PROVIDER);
  });

  it("keeps a link's provider for this visit when the browser refuses to store it", async () => {
    const storage = await loadPage();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota exceeded", "QuotaExceededError");
    });

    storage.setReferredVaultProvider(PROVIDER);

    expect(storage.getReferredVaultProvider()).toBe(PROVIDER);
  });

  it("does not bring back an older link's provider on reload when a newer one could not be stored", async () => {
    const firstLoad = await loadPage();
    firstLoad.setReferredVaultProvider(OTHER_PROVIDER);
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("quota exceeded", "QuotaExceededError");
      });
    firstLoad.setReferredVaultProvider(PROVIDER);
    setItem.mockRestore();

    const reload = await loadPage();

    expect(reload.getReferredVaultProvider()).toBeNull();
  });

  it("notifies subscribers when the referral changes", async () => {
    const storage = await loadPage();
    const listener = vi.fn();
    storage.subscribeReferredVaultProvider(listener);

    storage.setReferredVaultProvider(PROVIDER);
    storage.clearReferredVaultProviderIfOther(OTHER_PROVIDER);

    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("follows a referral another tab stored", async () => {
    const storage = await loadPage();
    const listener = vi.fn();
    storage.subscribeReferredVaultProvider(listener);

    // Another tab writes the record; this tab hears of it through the event.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, address: PROVIDER, savedAt: Date.now() }),
    );
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));

    expect(storage.getReferredVaultProvider()).toBe(PROVIDER);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("ignores another tab's change to a different storage key", async () => {
    const storage = await loadPage();
    storage.setReferredVaultProvider(PROVIDER);
    const listener = vi.fn();
    storage.subscribeReferredVaultProvider(listener);

    // The stored record changes without an event for it, then an event
    // arrives for some other key: this tab must not re-read its record.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        address: OTHER_PROVIDER,
        savedAt: Date.now(),
      }),
    );
    window.dispatchEvent(
      new StorageEvent("storage", { key: "tbv-cookie-consent" }),
    );

    expect(storage.getReferredVaultProvider()).toBe(PROVIDER);
    expect(listener).not.toHaveBeenCalled();
  });

  it("drops the referral when another tab clears the site's storage", async () => {
    const storage = await loadPage();
    storage.setReferredVaultProvider(PROVIDER);

    localStorage.clear();
    window.dispatchEvent(new StorageEvent("storage", { key: null }));

    expect(storage.getReferredVaultProvider()).toBeNull();
  });
});
