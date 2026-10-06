/**
 * Phone Ethereum session: leaving the tab for the wallet app and reloading the
 * page keep the session, with no second connect prompt.
 */

import { expect, test, type Page } from "@playwright/test";

import { injectPageWallets } from "./fixtures/pageWallets";
import { installRecordedBackend } from "./fixtures/replay";
import { blockOffsiteRequests, recordedPageWallets } from "./visual/capture";

/** core-ui `Portal` root. Every dialog renders inside one. */
const PORTAL_ROOT = ".portal-root";
/** First vite compile of a cold server. */
const APP_BOOT_TIMEOUT_MS = 30_000;
/** Longer than the 60 s connect wait, as when the user approves in the wallet app. */
const TIME_IN_WALLET_APP_MS = 70_000;

/** Stand in for the phone switching to the wallet app and back. */
async function setPageVisibility(
  page: Page,
  state: DocumentVisibilityState,
): Promise<void> {
  await page.evaluate((visibility) => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibility,
    });
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => visibility === "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  }, state);
}

test.describe("Phone Ethereum session", () => {
  test("keeps the Ethereum session after time in the wallet app and a reload", async ({
    page,
  }) => {
    await page.clock.install();
    await blockOffsiteRequests(page);
    await installRecordedBackend(page);
    await injectPageWallets(page, recordedPageWallets());
    const dialog = page.locator(PORTAL_ROOT);

    await page.goto("/", { waitUntil: "domcontentloaded" });

    await test.step("1. Connect only an Ethereum wallet", async () => {
      await page
        .getByTestId("connect-wallet-button")
        .first()
        .click({ timeout: APP_BOOT_TIMEOUT_MS });
      const commit = dialog.getByTestId("chains-connect-button");
      await expect(commit).toBeEnabled({ timeout: APP_BOOT_TIMEOUT_MS });
      await commit.click();
      await expect(commit).toHaveCount(0);
      await expect(page.getByTestId("wallet-menu-trigger")).toBeVisible();
    });

    await test.step("2. Leave for the wallet app past the connect wait, then return", async () => {
      await setPageVisibility(page, "hidden");
      await page.clock.fastForward(TIME_IN_WALLET_APP_MS);
      await setPageVisibility(page, "visible");

      await expect(page.getByTestId("wallet-menu-trigger")).toBeVisible();
    });

    await test.step("3. Reload: the session restores without a connect prompt", async () => {
      await page.reload({ waitUntil: "domcontentloaded" });

      await expect(page.getByTestId("wallet-menu-trigger")).toBeVisible({
        timeout: APP_BOOT_TIMEOUT_MS,
      });
      await expect(dialog.getByTestId("chains-connect-button")).toHaveCount(0);
    });
  });
});
