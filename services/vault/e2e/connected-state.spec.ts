/**
 * Proves the e2e "fully connected" seam works:
 *   - BTC injectable auto-reconnects from pre-seeded localStorage
 *   - ETH wagmi mock auto-connects via the e2e wagmi config
 *   - `<Connect>` flips to the connected wallet menu (renders both
 *     wallet avatars) instead of the connect button
 *
 * Subsequent specs (#1591 vault providers, #1592 deposit, etc.)
 * rely on this seam to land in a connected starting state.
 */

import {
  expect,
  mockGraphql,
  mockHealthCheck,
  mockMempoolForSeededBtcWallet,
  preConnectWallets,
  test,
} from "./fixtures";

test("preConnectWallets renders the connected wallet menu, not the connect button", async ({
  page,
  seededBtcWallet,
  seededEthWallet,
}) => {
  const btc = seededBtcWallet({ amount: 100_000n });
  const eth = seededEthWallet({ balanceWei: 5n * 10n ** 18n });
  await mockHealthCheck(page);
  await mockGraphql(page, () => ({ data: { __typename: "Query" } }));
  await mockMempoolForSeededBtcWallet(page, btc);
  await preConnectWallets(page, { btc, eth });

  await page.goto("/");
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

  // The connected wallet menu trigger renders avatars for each wallet;
  // the connect button (testid: "connect-wallet-button") is gone in
  // the connected branch.
  await expect(
    page.getByTestId("connect-wallet-button"),
  ).toHaveCount(0, { timeout: 15_000 });
});

test("preConnectWallets renders the 'Deposit BTC' CTA that's gated on connection", async ({
  page,
  seededBtcWallet,
  seededEthWallet,
}) => {
  const btc = seededBtcWallet({ amount: 100_000n });
  const eth = seededEthWallet({ balanceWei: 5n * 10n ** 18n });
  await mockHealthCheck(page);
  await mockGraphql(page, () => ({ data: { __typename: "Query" } }));
  await mockMempoolForSeededBtcWallet(page, btc);
  await preConnectWallets(page, { btc, eth });

  await page.goto("/");
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

  // RootLayout only renders the deposit CTA when both wallets are
  // connected and the app is past geofencing. Coin symbol varies by
  // network (BTC on mainnet, sBTC on signet) so we match on the
  // "Deposit " prefix rather than the full label.
  await expect(
    page.getByRole("button", { name: /^Deposit (s?BTC)$/i }),
  ).toBeVisible({ timeout: 15_000 });
});
