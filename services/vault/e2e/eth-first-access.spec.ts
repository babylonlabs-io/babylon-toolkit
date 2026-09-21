/**
 * Ethereum-only access: a session with no Bitcoin wallet uses the app, and
 * Bitcoin is requested only by an action that needs it.
 *
 * This spec is also the team demo. Run it headed at a readable pace:
 *
 *   E2E_SLOW_MO_MS=600 E2E_DEMO_BEAT_MS=1500 PLAYWRIGHT_LIST_PRINT_STEPS=1 \
 *     pnpm exec playwright test --project=chromium-eth-first --headed \
 *     --retries=0 --timeout=0 --reporter=list
 *
 * Add `E2E_DEMO_PAUSE=1` to stop at every beat until Resume is pressed in the
 * Playwright Inspector. Every pacing switch is off by default, so CI runs the
 * spec at full speed.
 */

import { expect, test, type Page } from "@playwright/test";

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
/** wallet-connector chain list suffix for a chain the app does not require. */
const OPTIONAL_SUFFIX = "(Optional)";
/** wallet-connector wallet list heading for the Bitcoin chain. */
const BTC_WALLET_LIST_HEADING = "Select Bitcoin Wallet";
/** wallet-connector wallet list hint: the on-screen "Bitcoin is needed". */
const BTC_WALLET_LIST_HINT = "To continue, connect a Bitcoin wallet";
/** Deposit dialog heading. */
const DEPOSIT_HEADING = "Deposit";
/** core-ui `WalletMenuCard` titles, `${walletType} Wallet`. */
const ETH_WALLET_CARD = "Ethereum Wallet";
const BTC_WALLET_CARD = "Bitcoin Wallet";
/** core-ui dialog controls. */
const BACK_LABEL = "Back";
const CLOSE_LABEL = "Close";
/** `COPY.wallet.locked.unlockButton`. */
const UNLOCK_LABEL = "Unlock wallet";
/** The deposit form's amount field (core-ui `AmountSlider`). */
const AMOUNT_INPUT = 'input[inputmode="decimal"]';
/**
 * TanStack Query devtools wrapper, mounted in development builds only. Its
 * launcher sits in the corner of every screen, so the demo hides it.
 */
const HIDE_DEVTOOLS_CSS =
  ".tsqd-parent-container { display: none !important; }";
/** Ethereum diamond for the injected wallet, so the header shows an icon. */
const ETH_WALLET_ICON = `data:image/svg+xml;base64,${Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
    '<circle cx="16" cy="16" r="16" fill="#627EEA"/>' +
    '<path fill="#fff" d="M16 4l-7.5 12.4L16 21l7.5-4.6z"/>' +
    '<path fill="#fff" fill-opacity=".6" d="M16 22.4l-7.5-4.5L16 28l7.5-10.1z"/>' +
    "</svg>",
).toString("base64")}`;

/** First vite compile of a cold server. */
const APP_BOOT_TIMEOUT_MS = 30_000;
/** Above the wallet-connector lock poll interval (10 s). */
const LOCK_PROBE_TIMEOUT_MS = 15_000;
/** Backends this walk must reach, checked against the recording at the end. */
const REQUIRED_BOUNDARIES = [
  "eth-rpc",
  "graphql",
  "vp-health",
  "mempool",
] as const;

/** Demo pacing. Unset in CI, so both are no-ops there. */
const DEMO_BEAT_MS =
  Number.parseInt(process.env.E2E_DEMO_BEAT_MS ?? "", 10) || 0;
const DEMO_PAUSE = process.env.E2E_DEMO_PAUSE === "1";

/**
 * Give the audience time to read the screen. `page.pause()` needs a headed
 * browser, so it never runs headless or in CI.
 */
async function holdForAudience(page: Page, headless: boolean): Promise<void> {
  if (DEMO_PAUSE && !headless && !process.env.CI) {
    await page.pause();
    return;
  }
  if (DEMO_BEAT_MS > 0) await page.waitForTimeout(DEMO_BEAT_MS);
}

/** Open or close the navbar wallet menu and wait for the new state. */
async function toggleWalletMenu(page: Page, expanded: boolean): Promise<void> {
  const trigger = page.getByTestId("wallet-menu-trigger");
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", String(expanded));
  // The menu body renders through a portal one commit after the trigger flips,
  // so an absence check straight after the toggle could read an empty menu and
  // pass for the wrong reason. The Ethereum card is there in every state this
  // walk opens the menu in, so waiting for it anchors what follows.
  if (expanded) {
    await expect(
      page.getByText(ETH_WALLET_CARD, { exact: true }),
    ).toBeVisible();
  }
}

/**
 * Lock the injected UniSat wallet the way an idle extension locks: its
 * non-interactive accounts read returns nothing. The next accounts request
 * stands in for the user approving the unlock prompt. The object is mutated,
 * not replaced, because the connector holds this same reference.
 */
async function lockInjectedBitcoinWallet(
  page: Page,
  btcAddress: string,
): Promise<void> {
  await page.evaluate((address) => {
    const { unisat } = window as unknown as {
      unisat: {
        getAccounts: () => Promise<string[]>;
        requestAccounts: () => Promise<string[]>;
      };
    };
    unisat.getAccounts = async () => [];
    unisat.requestAccounts = async () => {
      unisat.getAccounts = async () => [address];
      return [address];
    };
    // The connector probes the lock on focus, so the lock shows at once
    // instead of on the next 10 s poll.
    window.dispatchEvent(new Event("focus"));
  }, btcAddress);
}

test.describe("Ethereum-only access", () => {
  test("uses the app with only an Ethereum wallet and asks for Bitcoin only when an action needs it", async ({
    page,
    headless,
  }) => {
    const wallets = recordedPageWallets();
    await blockOffsiteRequests(page);
    const backend = await installRecordedBackend(page);
    await injectPageWallets(page, { ...wallets, ethIcon: ETH_WALLET_ICON });
    const dialog = page.locator(PORTAL_ROOT);

    // On every document, not just the first: vite reloads the page when it
    // optimizes a newly discovered dependency, and a style tag added to the
    // old document would leave the launcher on screen for the rest of the run.
    await page.addInitScript((css) => {
      const install = () => {
        const style = document.createElement("style");
        style.textContent = css;
        (document.head ?? document.documentElement).append(style);
      };
      // An init script runs before the parser has built either element, and a
      // throw here would be silent: nothing asserts the launcher is hidden.
      if (document.head ?? document.documentElement) install();
      else
        document.addEventListener("DOMContentLoaded", install, {
          once: true,
        });
    }, HIDE_DEVTOOLS_CSS);

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: ENTRY_HEADING }),
    ).toBeVisible({ timeout: APP_BOOT_TIMEOUT_MS });
    await expect(page.getByTestId("nav-vaults")).toHaveCount(0);
    await holdForAudience(page, headless);

    await test.step("1. Connect only an Ethereum wallet: the full app opens", async () => {
      await page.getByTestId("connect-wallet-button").first().click();
      await expect(
        dialog.getByTestId("select-bitcoin-wallet-button"),
      ).toContainText(OPTIONAL_SUFFIX);
      const commit = dialog.getByTestId("chains-connect-button");
      await expect(commit).toBeEnabled({ timeout: APP_BOOT_TIMEOUT_MS });
      await holdForAudience(page, headless);

      await commit.click();
      await expect(commit).toHaveCount(0);
      await expect(page.getByTestId("wallet-menu-trigger")).toBeVisible();
      await expect(page.getByTestId("nav-vaults")).toBeVisible();
      await assertNoErrorSurface(page, "Ethereum-only session");

      await toggleWalletMenu(page, true);
      await expect(
        page.getByText(BTC_WALLET_CARD, { exact: true }),
      ).toHaveCount(0);
      await holdForAudience(page, headless);
      await toggleWalletMenu(page, false);

      await page.getByTestId("nav-vaults").click();
      await expect(page).toHaveURL(/\/vaults$/);
      await expect(page.getByTestId("deposit-button").first()).toBeVisible();
      await holdForAudience(page, headless);
    });

    await test.step("2. Deposit needs Bitcoin: the app asks for a Bitcoin wallet", async () => {
      await page.getByTestId("deposit-button").first().click();
      await expect(
        dialog.getByRole("heading", {
          name: BTC_WALLET_LIST_HEADING,
          exact: true,
        }),
      ).toBeVisible();
      await expect(dialog.getByText(BTC_WALLET_LIST_HINT)).toBeVisible();
      await expect(dialog.getByTestId("wallet-option-unisat")).toBeVisible();
      await expect(
        dialog.getByRole("heading", { name: DEPOSIT_HEADING, exact: true }),
      ).toHaveCount(0);
      await holdForAudience(page, headless);
    });

    await test.step("3. Cancel: nothing starts", async () => {
      await dialog
        .getByRole("button", { name: BACK_LABEL, exact: true })
        .click();
      await expect(
        dialog.getByTestId("select-bitcoin-wallet-button"),
      ).toContainText(OPTIONAL_SUFFIX);
      await dialog
        .getByRole("button", { name: CLOSE_LABEL, exact: true })
        .click();
      await expect(dialog.getByTestId("chains-connect-button")).toHaveCount(0);
      await expect(
        dialog.getByRole("heading", { name: DEPOSIT_HEADING, exact: true }),
      ).toHaveCount(0);
      await expect(dialog.locator(AMOUNT_INPUT)).toHaveCount(0);

      await toggleWalletMenu(page, true);
      await expect(
        page.getByText(BTC_WALLET_CARD, { exact: true }),
      ).toHaveCount(0);
      await toggleWalletMenu(page, false);
      await holdForAudience(page, headless);
    });

    await test.step("4. Connect Bitcoin from the prompt: the deposit waits for a second click", async () => {
      await page.getByTestId("deposit-button").first().click();
      await expect(
        dialog.getByRole("heading", {
          name: BTC_WALLET_LIST_HEADING,
          exact: true,
        }),
      ).toBeVisible();
      await dialog.getByTestId("wallet-option-unisat").click();
      const commit = dialog.getByTestId("chains-connect-button");
      await expect(commit).toBeEnabled();
      await holdForAudience(page, headless);

      await commit.click();
      await expect(commit).toHaveCount(0);
      await toggleWalletMenu(page, true);
      await expect(
        page.getByText(BTC_WALLET_CARD, { exact: true }),
      ).toBeVisible();
      await toggleWalletMenu(page, false);
      // Connecting is not consent to run: no deposit form opened by itself.
      await expect(
        dialog.getByRole("heading", { name: DEPOSIT_HEADING, exact: true }),
      ).toHaveCount(0);
      await expect(dialog.locator(AMOUNT_INPUT)).toHaveCount(0);
      await holdForAudience(page, headless);

      await page.getByTestId("deposit-button").first().click();
      await expect(
        dialog.getByRole("heading", { name: DEPOSIT_HEADING, exact: true }),
      ).toBeVisible();
      await expect(dialog.locator(AMOUNT_INPUT).first()).toBeVisible();
      // A form that mounts and then fails still shows its heading.
      await assertNoErrorSurface(page, "deposit form");
      await holdForAudience(page, headless);

      // Stop at the open form: the injected wallets never sign.
      await dialog
        .getByRole("button", { name: CLOSE_LABEL, exact: true })
        .click();
      await expect(
        dialog.getByRole("heading", { name: DEPOSIT_HEADING, exact: true }),
      ).toHaveCount(0);
    });

    await test.step("5. A locked Bitcoin wallet shows an unlock path", async () => {
      await lockInjectedBitcoinWallet(page, wallets.btcAddress);
      await toggleWalletMenu(page, true);
      const unlock = page.getByTestId("wallet-menu-unlock");
      await expect(unlock).toHaveText(UNLOCK_LABEL, {
        timeout: LOCK_PROBE_TIMEOUT_MS,
      });
      await holdForAudience(page, headless);

      await unlock.click();
      await expect(page.getByTestId("wallet-menu-trigger")).toHaveAttribute(
        "aria-expanded",
        "false",
      );
      // The unlock entry is the only thing that tells the two states apart:
      // a locked wallet still counts as connected, so its card stays visible.
      await toggleWalletMenu(page, true);
      await expect(page.getByTestId("wallet-menu-unlock")).toHaveCount(0);
      await toggleWalletMenu(page, false);
      await holdForAudience(page, headless);
    });

    await test.step("6. Deposit with a locked Bitcoin wallet: unlock first, then a second click", async () => {
      await lockInjectedBitcoinWallet(page, wallets.btcAddress);
      await toggleWalletMenu(page, true);
      await expect(page.getByTestId("wallet-menu-unlock")).toHaveText(
        UNLOCK_LABEL,
        { timeout: LOCK_PROBE_TIMEOUT_MS },
      );
      await toggleWalletMenu(page, false);
      await holdForAudience(page, headless);

      // The click asks the wallet to unlock and opens nothing.
      await page.getByTestId("deposit-button").first().click();
      await toggleWalletMenu(page, true);
      await expect(page.getByTestId("wallet-menu-unlock")).toHaveCount(0);
      await toggleWalletMenu(page, false);
      await expect(
        dialog.getByRole("heading", { name: DEPOSIT_HEADING, exact: true }),
      ).toHaveCount(0);
      await expect(dialog.locator(AMOUNT_INPUT)).toHaveCount(0);
      await holdForAudience(page, headless);

      await page.getByTestId("deposit-button").first().click();
      await expect(
        dialog.getByRole("heading", { name: DEPOSIT_HEADING, exact: true }),
      ).toBeVisible();
      await holdForAudience(page, headless);
      await dialog
        .getByRole("button", { name: CLOSE_LABEL, exact: true })
        .click();
      await expect(
        dialog.getByRole("heading", { name: DEPOSIT_HEADING, exact: true }),
      ).toHaveCount(0);
    });

    // Last, so a gap in the recording does not cut a live demo short.
    assertRecordingCovered(
      backend,
      "Ethereum-only access",
      REQUIRED_BOUNDARIES,
    );
  });
});
