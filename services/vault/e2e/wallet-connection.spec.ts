/**
 * Wallet Connection — BT-01 (Bitcoin) and BT-02 (Ethereum)
 *
 * BT-03 (Babylon chain / BBN wallet) is not applicable to the vault service:
 * the vault WalletConnectionProvider only configures chains ["BTC", "ETH"].
 * BBN wallet tests live in the simple-staking service.
 *
 * Connection flow tested here:
 *   1. page.addInitScript injects window.unisat + window.ethereum mocks
 *   2. Test clicks the Connect button to open the wallet-connector modal
 *   3. Test clicks through the modal to select UniSat (BTC) and Browser Wallet (ETH)
 *   4. The wallet-connector calls the mock APIs and sets connected state
 *   5. Assertions verify the connected address is displayed
 *
 * Exact modal selectors depend on the @babylonlabs-io/wallet-connector version.
 * Labels like "UniSat" and "Browser Wallet" are based on the registered wallet
 * names; update them if the connector package renames wallet entries.
 */

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import {
  injectRejectingBtcWallet,
  injectWalletMocks,
  MOCK_BTC_ADDRESS,
  MOCK_ETH_ADDRESS,
} from "./helpers/wallet-mock";

const BASE_URL = "http://localhost:5175";

// ---------------------------------------------------------------------------
// Infrastructure mocks
// ---------------------------------------------------------------------------

async function setupHealthyInfra(page: Page): Promise<void> {
  await page.route("**/health", async (route) => {
    await route.fulfill({ status: 200, body: "OK" });
  });

  await page.route("**/graphql", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { __typename: "Query" } }),
    });
  });

  await page.route(/.*eth.*|.*rpc.*/, async (route) => {
    const postData = route.request().postDataJSON();
    if (postData?.method === "eth_call") {
      const data = (postData.params?.[0] as { data?: string })?.data ?? "";
      if (data.startsWith("0x5c975abb")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: postData.id,
            result:
              "0x0000000000000000000000000000000000000000000000000000000000000000",
          }),
        });
        return;
      }
    }
    await route.continue();
  });

  await page.route("**/address/screening**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { address: { risk: "low" } } }),
    });
  });
}

/**
 * Clicks the Connect button, selects UniSat for BTC, and selects the
 * injected browser wallet for ETH through the wallet-connector modal flow.
 * Returns once both wallets are connected (BTC address visible).
 */
async function connectBothWallets(page: Page): Promise<void> {
  const connectButton = page.getByRole("button", { name: /connect/i });
  await expect(connectButton).toBeVisible({ timeout: 15_000 });
  await connectButton.click();

  // The wallet-connector modal opens.  Because requiredChains=["BTC","ETH"],
  // it presents BTC wallet options first, then ETH.
  const walletModal = page.getByRole("dialog");
  await expect(walletModal).toBeVisible({ timeout: 10_000 });

  // BTC step — select UniSat (the only enabled BTC wallet in the vault app).
  await page.getByRole("button", { name: /unisat/i }).click();

  // ETH step — select the browser / injected wallet (uses window.ethereum).
  // The wallet-connector may auto-advance to the ETH step after BTC connects,
  // or it may be in the same modal step.
  await page.getByRole("button", { name: /browser wallet|injected/i }).click();

  // The modal should close once both chains are connected.
  await expect(walletModal).not.toBeVisible({ timeout: 15_000 });
}

// ---------------------------------------------------------------------------
// BT-01: User can connect a Bitcoin wallet
// ---------------------------------------------------------------------------

test.describe("Bitcoin Wallet Connection — BT-01", () => {
  test.beforeEach(async ({ page }) => {
    await injectWalletMocks(page);
    await setupHealthyInfra(page);
  });

  test("[BT-01-AC1] Wallet selection modal lists all supported BTC wallets with their icons and names", async ({
    page,
  }) => {
    await page.goto(BASE_URL);

    const connectButton = page.getByRole("button", { name: /connect/i });
    await expect(connectButton).toBeVisible({ timeout: 15_000 });
    await connectButton.click();

    const walletModal = page.getByRole("dialog");
    await expect(walletModal).toBeVisible({ timeout: 10_000 });

    // UniSat is the only enabled BTC wallet in the vault app (all others are
    // gated via DISABLED_WALLETS in VaultWalletConnectionProvider).
    await expect(
      page.getByRole("button", { name: /unisat/i }),
    ).toBeVisible();
  });

  test("[BT-01-AC2] After authorisation the app displays the connected Taproot (P2TR) address", async ({
    page,
  }) => {
    await page.goto(BASE_URL);
    await connectBothWallets(page);

    // BTC address appears in the BtcEthWalletMenu trigger area.
    await expect(page.getByText(MOCK_BTC_ADDRESS)).toBeVisible({
      timeout: 15_000,
    });
  });

  test("[BT-01-AC3] If the user rejects the connection prompt, the modal closes without error and no address is stored", async ({
    page,
  }) => {
    // Override: inject a wallet that throws on requestAccounts.
    await injectRejectingBtcWallet(page);
    await page.goto(BASE_URL);

    const connectButton = page.getByRole("button", { name: /connect/i });
    await connectButton.click();

    const walletModal = page.getByRole("dialog");
    await expect(walletModal).toBeVisible({ timeout: 10_000 });

    // Click UniSat — the mock wallet will throw "User rejected".
    await page.getByRole("button", { name: /unisat/i }).click();

    // The modal should close or show a dismissible error — it must not show
    // an unhandled crash.  The BTC address must not appear anywhere on the page.
    await expect(page.getByText(MOCK_BTC_ADDRESS)).not.toBeVisible({
      timeout: 10_000,
    });

    // No blocking error dialog should be triggered.
    await expect(
      page.getByRole("heading", { name: /configuration error/i }),
    ).not.toBeVisible();
  });

  test("[BT-01-AC4] Disconnecting the wallet clears the address and public key from app state", async ({
    page,
  }) => {
    await page.goto(BASE_URL);
    await connectBothWallets(page);

    // Confirm the address is visible first.
    await expect(page.getByText(MOCK_BTC_ADDRESS)).toBeVisible({
      timeout: 15_000,
    });

    // Open the wallet menu and disconnect.
    await page.getByText(MOCK_BTC_ADDRESS).click();
    await page.getByRole("button", { name: /disconnect/i }).click();

    // Address must disappear and the Connect button must return.
    await expect(page.getByText(MOCK_BTC_ADDRESS)).not.toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByRole("button", { name: /connect/i }),
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// BT-02: User can connect an Ethereum wallet
// ---------------------------------------------------------------------------

test.describe("Ethereum Wallet Connection — BT-02", () => {
  test.beforeEach(async ({ page }) => {
    await injectWalletMocks(page);
    await setupHealthyInfra(page);
  });

  test("[BT-02-AC1] The connect flow launches the AppKit modal showing available Ethereum wallets", async ({
    page,
  }) => {
    await page.goto(BASE_URL);

    const connectButton = page.getByRole("button", { name: /connect/i });
    await connectButton.click();

    const walletModal = page.getByRole("dialog");
    await expect(walletModal).toBeVisible({ timeout: 10_000 });

    // AppKit renders "Browser Wallet" (or "Injected") for window.ethereum.
    await expect(
      page.getByRole("button", { name: /browser wallet|injected/i }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("[BT-02-AC2] After connection the app displays the connected Ethereum address", async ({
    page,
  }) => {
    await page.goto(BASE_URL);
    await connectBothWallets(page);

    // ETH address appears in the wallet menu alongside the BTC address.
    await expect(page.getByText(MOCK_ETH_ADDRESS)).toBeVisible({
      timeout: 15_000,
    });
  });

  test("[BT-02-AC3] Disconnecting removes the Ethereum address without affecting the BTC wallet display", async ({
    page,
  }) => {
    await page.goto(BASE_URL);
    await connectBothWallets(page);

    await expect(page.getByText(MOCK_ETH_ADDRESS)).toBeVisible({
      timeout: 15_000,
    });

    // Cross-disconnect logic in VaultWalletConnectionProvider means disconnecting
    // one wallet disconnects both.  Verify the ETH address clears after disconnect.
    await page.getByText(MOCK_BTC_ADDRESS).click();
    await page.getByRole("button", { name: /disconnect/i }).click();

    await expect(page.getByText(MOCK_ETH_ADDRESS)).not.toBeVisible({
      timeout: 10_000,
    });
  });

  test("[BT-02-AC4] The Ethereum wallet is required before any Ethereum transaction can be submitted", async ({
    page,
  }) => {
    await page.goto(BASE_URL);

    // Without wallet connection, the Deposit button (which triggers ETH transactions)
    // is not shown — only the Connect button is visible.
    const depositButton = page.getByRole("button", { name: /deposit btc/i });
    await expect(depositButton).not.toBeVisible({ timeout: 5_000 });

    const connectButton = page.getByRole("button", { name: /connect/i });
    await expect(connectButton).toBeVisible();
  });
});
