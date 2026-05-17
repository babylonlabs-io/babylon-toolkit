/**
 * Smoke spec for the e2e fixture scaffold introduced in #1589.
 *
 * Verifies:
 *   - the typed seeded-wallet factories return values that satisfy the
 *     mempool wire shape the dApp's `useUTXOs` consumes;
 *   - `installWallets` writes a sentinel to `window.__BABYLON_E2E_WALLETS__`
 *     before navigation completes;
 *   - the page-object scaffold reaches the running app (AppShell on `/`).
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

test("seededBtcWallet exposes mempool-wire payloads that sum to the seeded amount", ({
  seededBtcWallet,
}) => {
  const wallet = seededBtcWallet({ amount: 250_000n });
  expect(wallet.balanceSats).toBe(250_000n);
  const totalValue = wallet.mempoolUtxos.reduce((s, u) => s + u.value, 0);
  expect(BigInt(totalValue)).toBe(250_000n);
  expect(wallet.mempoolAddressInfo.isvalid).toBe(true);
  // P2TR scriptPubKey: 0x5120 (OP_1 push-32) + 32-byte x-only pubkey (64 hex)
  expect(wallet.mempoolAddressInfo.scriptPubKey).toMatch(/^5120[0-9a-f]{64}$/);
});

test("seededBtcWallet rejects utxoSplit that doesn't sum to amount", ({
  seededBtcWallet,
}) => {
  expect(() =>
    seededBtcWallet({ amount: 100n, utxoSplit: [40n, 50n] }),
  ).toThrow(/sum to 90n, expected 100n/);
});

test("seededEthWallet exposes balanceWeiHex as a valid quantity", ({
  seededEthWallet,
}) => {
  const wallet = seededEthWallet({ balanceWei: 5n * 10n ** 18n });
  expect(wallet.balanceWeiHex).toBe(`0x${(5n * 10n ** 18n).toString(16)}`);
});

test("installWallets sets the e2e wallet global before navigation", async ({
  page,
  seededBtcWallet,
  installWallets,
}) => {
  const wallet = seededBtcWallet({ amount: 100_000n });
  await mockMempoolForSeededBtcWallet(page, wallet);
  await mockVpProxy(page);
  await installWallets({ btc: wallet });
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
