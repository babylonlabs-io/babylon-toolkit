import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const STORAGE_KEY = "tbv-referred-vault-provider";
const PROVIDER = "0xaf8d9d665f4e27f3966a074dce5c50684bfbe358";
const EARLIER_PROVIDER = "0x1234567890abcdef1234567890abcdef12345678";

/** Load the modules as a new page load would, at the given landing URL. */
async function landOn(path: string) {
  window.history.replaceState(null, "", path);
  vi.resetModules();
  const { captureReferredVaultProvider } = await import(
    "../captureReferredVaultProvider"
  );
  const { getReferredVaultProvider } = await import(
    "@/storage/referredVaultProviderStorage"
  );
  return { captureReferredVaultProvider, getReferredVaultProvider };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("captureReferredVaultProvider", () => {
  it("stores the provider the link names", async () => {
    const page = await landOn(
      "/vaults?vp=0xaf8d9D665f4e27F3966a074DCE5c50684BFBE358",
    );

    page.captureReferredVaultProvider();

    expect(page.getReferredVaultProvider()).toBe(PROVIDER);
  });

  it("removes `vp` from the address bar and keeps the other parameters", async () => {
    const page = await landOn(
      `/vaults?utm_source=partner&vp=${PROVIDER}&utm_campaign=launch#top`,
    );

    page.captureReferredVaultProvider();

    expect(window.location.pathname).toBe("/vaults");
    expect(window.location.search).toBe(
      "?utm_source=partner&utm_campaign=launch",
    );
    expect(window.location.hash).toBe("#top");
  });

  it("removes a value that is not an address and keeps the stored referral", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        address: EARLIER_PROVIDER,
        savedAt: Date.now(),
      }),
    );
    const page = await landOn("/?vp=figment");

    page.captureReferredVaultProvider();

    expect(page.getReferredVaultProvider()).toBe(EARLIER_PROVIDER);
    expect(window.location.search).toBe("");
  });

  it("leaves the URL and the stored referral alone without a `vp`", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        address: EARLIER_PROVIDER,
        savedAt: Date.now(),
      }),
    );
    // `%20` would come back as `+` if the URL were rewritten.
    const page = await landOn("/vaults?utm_source=partner%20site");

    page.captureReferredVaultProvider();

    expect(page.getReferredVaultProvider()).toBe(EARLIER_PROVIDER);
    expect(window.location.search).toBe("?utm_source=partner%20site");
  });
});
