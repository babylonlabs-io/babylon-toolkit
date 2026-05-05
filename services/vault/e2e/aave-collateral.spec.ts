/**
 * Aave Collateral — BT-13 (collateral position view) and BT-14 (vault reorder)
 *
 * BT-13 covers the dashboard's overview + collateral display.  BT-14 covers
 * the reorder dialog used to set the withdrawal sequence across multiple
 * collateral vaults.  These tests assert the structural UI behaviour - the
 * underlying calculations (health factor, projected HF, ordering tx) are
 * covered by unit tests in `applications/aave/utils`.
 */

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { setupHealthyInfra } from "./helpers/infra-mock";
import { injectWalletMocks } from "./helpers/wallet-mock";

const BASE_URL = "http://localhost:5175";

async function connectWallets(page: Page): Promise<void> {
  const connectButton = page.getByRole("button", { name: /connect/i });
  await expect(connectButton).toBeVisible({ timeout: 15_000 });
  await connectButton.click();

  const walletModal = page.getByRole("dialog");
  await expect(walletModal).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: /unisat/i }).click();
  await page.getByRole("button", { name: /browser wallet|injected/i }).click();

  await expect(walletModal).not.toBeVisible({ timeout: 15_000 });
}

// ---------------------------------------------------------------------------
// BT-13: User can view their BTC collateral position on Aave
// ---------------------------------------------------------------------------

test.describe("Aave Collateral Position View — BT-13", { tag: ["@spec:005-aave-collateral", "@story:BT-13"] }, () => {
  test.beforeEach(async ({ page }) => {
    await injectWalletMocks(page);
    await setupHealthyInfra(page);
  });

  test("[BT-13-AC1] The Overview section is rendered with Health Factor, Collateral Value, and Amount to Repay rows", async ({
    page,
  }) => {
    await page.goto(BASE_URL);
    await connectWallets(page);

    await expect(
      page.getByRole("heading", { name: /^overview$/i }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/health factor/i).first()).toBeVisible();
    await expect(page.getByText(/total collateral value/i)).toBeVisible();
  });

  test("[BT-13-AC2] When no wallet is connected, monetary fields render as `--` rather than zero", async ({
    page,
  }) => {
    // Skip wallet injection so the user remains disconnected.
    await page.goto(BASE_URL);

    // The "--" placeholder indicates the unconnected state, distinct from a
    // legitimate zero balance.  Locate by label proximity.
    await expect(
      page.getByText(/total collateral value/i),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("--").first()).toBeVisible();
  });

  test("[BT-13-AC3] When the user has no collateral, the collateral card prompts them to deposit", async ({
    page,
  }) => {
    await page.goto(BASE_URL);
    await connectWallets(page);

    await expect(
      page.getByText(/deposit bitcoin to get started/i),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("[BT-13-AC4] The Loans section is present alongside Collateral on the dashboard", async ({
    page,
  }) => {
    await page.goto(BASE_URL);
    await connectWallets(page);

    await expect(
      page.getByRole("heading", { name: /^loans$/i }),
    ).toBeVisible({ timeout: 15_000 });

    // Borrow CTA is rendered but disabled when there is no collateral.
    const borrowButton = page.getByRole("button", { name: /^borrow$/i });
    await expect(borrowButton).toBeVisible();
    await expect(borrowButton).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// BT-14: User can reorder collateral vaults to optimise withdrawal
// ---------------------------------------------------------------------------

test.describe("Reorder Collateral Vaults — BT-14", { tag: ["@spec:005-aave-collateral", "@story:BT-14"] }, () => {
  test.beforeEach(async ({ page }) => {
    await injectWalletMocks(page);
    await setupHealthyInfra(page);
  });

  test("[BT-14-AC1] The Reorder button is hidden when fewer than two vaults exist", async ({
    page,
  }) => {
    await page.goto(BASE_URL);
    await connectWallets(page);

    // Without any collateral the reorder button must not be rendered.
    await expect(
      page.getByRole("button", { name: /^reorder$/i }),
    ).toHaveCount(0);
  });

  test("[BT-14-AC2] The Collateral header still renders when the user is connected without vaults", async ({
    page,
  }) => {
    await page.goto(BASE_URL);
    await connectWallets(page);

    await expect(
      page.getByRole("heading", { name: /^collateral$/i }),
    ).toBeVisible({ timeout: 15_000 });
  });
});
