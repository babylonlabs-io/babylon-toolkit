import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const CONSENT_KEY = "tbv-cookie-consent";

function cookieNames(): string[] {
  return document.cookie
    .split("; ")
    .filter((pair) => pair !== "")
    .map((pair) => pair.slice(0, pair.indexOf("=")));
}

function clearCookies(): void {
  for (const name of cookieNames()) {
    document.cookie = `${name}=;max-age=-1;path=/`;
  }
}

/** Load the module as a new page load would, with the stored answer read fresh. */
async function loadPage() {
  vi.resetModules();
  const consent = await import("@/storage/cookieConsentStorage");
  const { walletCookieStorage } = await import("../walletCookieStorage");
  return { ...consent, walletCookieStorage };
}

function storeAnswer(choice: string): void {
  localStorage.setItem(CONSENT_KEY, JSON.stringify({ version: 1, choice }));
}

beforeEach(() => {
  localStorage.clear();
  clearCookies();
  document.cookie = "wagmi.store=connected;path=/";
  document.cookie = "bbn_src=campaign;path=/";
});

afterEach(() => {
  localStorage.clear();
  clearCookies();
});

describe("walletCookieStorage", () => {
  it("deletes the wallet cookies and keeps other cookies when the visitor answers Deny", async () => {
    const { setCookieConsent } = await loadPage();

    setCookieConsent("denied");

    expect(cookieNames()).toEqual(["bbn_src"]);
  });

  it("deletes leftover wallet cookies on a page load with Deny already stored", async () => {
    localStorage.setItem(
      CONSENT_KEY,
      JSON.stringify({ version: 1, choice: "denied" }),
    );

    await loadPage();

    expect(cookieNames()).toEqual(["bbn_src"]);
  });

  it("keeps the wallet cookies on a page load with Essential only stored", async () => {
    localStorage.setItem(
      CONSENT_KEY,
      JSON.stringify({ version: 1, choice: "essential" }),
    );

    await loadPage();

    expect(cookieNames()).toContain("wagmi.store");
  });

  it("writes and reads no wallet cookie after Deny", async () => {
    storeAnswer("denied");
    const { walletCookieStorage } = await loadPage();
    document.cookie = "wagmi.recentConnectorId=injected;path=/";

    walletCookieStorage.setItem("wagmi.store", "connected");

    expect(cookieNames()).not.toContain("wagmi.store");
    expect(walletCookieStorage.getItem("wagmi.recentConnectorId")).toBeNull();
  });

  it("writes and reads the wallet cookies with Essential only stored", async () => {
    storeAnswer("essential");
    const { walletCookieStorage } = await loadPage();

    walletCookieStorage.setItem("wagmi.recentConnectorId", "injected");

    expect(walletCookieStorage.getItem("wagmi.recentConnectorId")).toBe(
      "injected",
    );
  });

  it("deletes the wallet cookies when another tab answers Deny", async () => {
    const { getCookieConsent } = await loadPage();
    storeAnswer("denied");

    window.dispatchEvent(new StorageEvent("storage", { key: CONSENT_KEY }));

    expect(getCookieConsent()).toBe("denied");
    expect(cookieNames()).toEqual(["bbn_src"]);
  });
});
