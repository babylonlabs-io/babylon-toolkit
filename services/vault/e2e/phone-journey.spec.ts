/**
 * The phone journey: one walk through the app on a phone, with one
 * `test.step` per mobile ticket. #2581 is the first step; later tickets add
 * theirs. Runs on the phone projects only (see `PHONE_ONLY_SPECS` in
 * playwright.config.ts).
 */

import { expect, test } from "@playwright/test";

import { injectPageWallets } from "./fixtures/pageWallets";
import { installRecordedBackend } from "./fixtures/replay";
import {
  assertNoErrorSurface,
  assertRecordingCovered,
  blockOffsiteRequests,
  recordedPageWallets,
} from "./visual/capture";

/** core-ui `Portal` root. Every dialog renders inside one. */
const PORTAL_ROOT = ".portal-root";
/** Entry page hero heading, shown before any wallet connects. */
const ENTRY_HEADING = "Borrow against native Bitcoin, trustlessly.";
/** wallet-connector wallet list heading for the Bitcoin chain. */
const BTC_WALLET_LIST_HEADING = "Select Bitcoin Wallet";
/** Deposit dialog heading. */
const DEPOSIT_HEADING = "Deposit";
/** First vite compile of a cold server. */
const APP_BOOT_TIMEOUT_MS = 30_000;
/** Backends this walk must reach, checked against the recording at the end. */
const REQUIRED_BOUNDARIES = [
  "eth-rpc",
  "graphql",
  "vp-health",
  "mempool",
] as const;

test.describe("Phone journey", () => {
  test("a phone with only an Ethereum wallet is sent to desktop for Bitcoin actions", async ({
    page,
  }) => {
    const wallets = recordedPageWallets();
    await blockOffsiteRequests(page);
    const backend = await installRecordedBackend(page);
    await injectPageWallets(page, { ...wallets, omitBitcoin: true });
    const dialog = page.locator(PORTAL_ROOT);

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: ENTRY_HEADING }),
    ).toBeVisible({ timeout: APP_BOOT_TIMEOUT_MS });

    await page.getByTestId("connect-wallet-button").first().tap();
    const commit = dialog.getByTestId("chains-connect-button");
    await expect(commit).toBeEnabled({ timeout: APP_BOOT_TIMEOUT_MS });
    await expect(
      dialog.getByTestId("select-bitcoin-wallet-button"),
    ).toHaveCount(0);
    await commit.tap();
    await expect(commit).toHaveCount(0);
    await expect(page.getByTestId("wallet-menu-trigger")).toBeVisible();
    await assertNoErrorSurface(page, "Ethereum-only phone session");

    await page.getByTestId("header-menu-button").tap();
    await page.getByTestId("nav-vaults").tap();
    await expect(page).toHaveURL(/\/vaults$/);

    await test.step("#2581: a Bitcoin action sends the phone user to desktop", async () => {
      const url = page.url();
      let newPages = 0;
      page.context().on("page", () => {
        newPages += 1;
      });

      await page.getByTestId("deposit-button").first().tap();

      const desktopDialog = page.getByTestId("continue-on-desktop-dialog");
      await expect(desktopDialog).toBeVisible();
      await expect(
        page.getByRole("heading", {
          name: BTC_WALLET_LIST_HEADING,
          exact: true,
        }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("heading", { name: DEPOSIT_HEADING, exact: true }),
      ).toHaveCount(0);
      expect(newPages).toBe(0);
      expect(page.url()).toBe(url);

      await page.getByTestId("continue-on-desktop-back").tap();
      await expect(desktopDialog).toBeHidden();
      expect(newPages).toBe(0);
      expect(page.url()).toBe(url);
    });

    assertRecordingCovered(backend, "Phone journey", REQUIRED_BOUNDARIES);
  });
});
