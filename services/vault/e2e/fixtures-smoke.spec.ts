/**
 * Smoke spec for the e2e fixture scaffold introduced in #1589.
 *
 * Verifies the bits that genuinely need a browser:
 *   - `installWalletSentinel` writes a sentinel to
 *     `window.__BABYLON_E2E_WALLETS__` before navigation completes;
 *   - the page-object scaffold reaches the running app (AppShell on `/`).
 *
 * Pure-factory invariants (seededBtcWallet / seededEthWallet output
 * shape) live alongside the other fixture unit tests under
 * `fixtures/__tests__/seededWallets.test.ts` so they run under vitest
 * instead of spinning up the Playwright webServer + browser context.
 *
 * The deeper page interactions (clicking through the deposit modal,
 * asserting a position appears) belong to the per-flow tickets.
 */

import {
  E2E_WALLETS_GLOBAL,
  expect,
  mockMempoolForSeededBtcWallet,
  mockVpProxy,
  test,
} from "./fixtures";

test("installWalletSentinel sets the e2e wallet global before navigation", async ({
  page,
  seededBtcWallet,
  installWalletSentinel,
}) => {
  const wallet = seededBtcWallet({ amount: 100_000n });
  await mockMempoolForSeededBtcWallet(page, wallet);
  await mockVpProxy(page);
  await installWalletSentinel({ btc: wallet });
  await page.goto("/");

  const installed = await page.evaluate((name) => {
    const w = window as unknown as Record<
      string,
      { btc?: { kind?: string; address?: string } } | undefined
    >;
    return w[name];
  }, E2E_WALLETS_GLOBAL);

  expect(installed?.btc?.kind).toBe("seeded-btc");
  expect(installed?.btc?.address).toBe(wallet.address);
});

test("AppShell page object reaches the app shell at /", async ({
  page,
  appShell,
}) => {
  await mockVpProxy(page);
  await appShell.goto();
  // The shell renders the connect entry point even before a wallet is
  // injected. We don't assert visibility (the unconnected state may
  // show a different label depending on copy) - reaching the page
  // without a navigation error is enough for the smoke check.
  await expect(page).toHaveURL(/\/$/);
});
