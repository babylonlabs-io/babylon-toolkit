/**
 * Wallet connect / disconnect (#1590) - pragmatic scope.
 *
 * Covers the parts of the ticket that work today with mock-first
 * infra:
 *   - connect-button visible & enabled in healthy state
 *   - connect-button disabled with "Not available in your region"
 *     hint when /health returns 451
 *   - window.btcwallet injection plants a deterministic IBTCProvider
 *     before the dApp loads
 *   - the wallet provider's getAddress / getNetwork methods return
 *     the values the test declared
 *
 * Deferred (separate ticket): connected-state UI, ETH connect/disconnect,
 * address truncation in the rendered menu, network mismatch banner.
 * Connected-state assertions require an ETH provider, which the dApp
 * gets through Reown's AppKit - mocking that needs its own design.
 */

import {
  expect,
  injectBtcWalletProvider,
  mockGraphql,
  mockHealthCheck,
  mockMempoolForSeededBtcWallet,
  mockVpProxy,
  test,
} from "./fixtures";

const CONNECT_BUTTON_TESTID = "connect-wallet-button";

test("connect button is visible and enabled when /health returns 200", async ({
  page,
}) => {
  await mockHealthCheck(page);
  await mockGraphql(page, () => ({ data: { __typename: "Query" } }));
  await mockVpProxy(page);

  await page.goto("/");
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});

  const button = page.getByTestId(CONNECT_BUTTON_TESTID);
  await expect(button).toBeVisible();
  await expect(button).toBeEnabled();
});

test("connect button is disabled with geo hint when /health returns 451", async ({
  page,
}) => {
  await mockHealthCheck(page, { status: 451 });
  await mockGraphql(page, () => ({ data: { __typename: "Query" } }));
  await mockVpProxy(page);

  await page.goto("/");
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});

  const button = page.getByTestId(CONNECT_BUTTON_TESTID);
  await expect(button).toBeVisible();
  await expect(button).toBeDisabled();
  // react-tooltip stores the hint copy in a data-tooltip-content
  // attribute on the trigger span (see core-ui Hint.tsx). Asserting
  // on the attribute keeps the test stable regardless of whether the
  // tooltip is currently open in the DOM.
  await expect(
    page.locator("[data-tooltip-content='Not available in your region']"),
  ).toBeAttached();
});

test("window.btcwallet provider exposes the declared address and network", async ({
  page,
  seededBtcWallet,
}) => {
  const wallet = seededBtcWallet({ amount: 100_000n });
  await mockHealthCheck(page);
  await mockGraphql(page, () => ({ data: { __typename: "Query" } }));
  await mockVpProxy(page);
  await mockMempoolForSeededBtcWallet(page, wallet);
  await injectBtcWalletProvider(page, {
    address: wallet.address,
    publicKeyHex: `02${"ab".repeat(32)}`,
    network: "signet",
    providerName: "E2E Mock BTC",
    providerIcon: "data:image/svg+xml;base64,PHN2Zy8+",
    e2e: true,
  });

  await page.goto("/");

  const probed = await page.evaluate(async () => {
    const w = (window as unknown as {
      btcwallet?: {
        getAddress: () => Promise<string>;
        getNetwork: () => Promise<string>;
        getWalletProviderName: () => Promise<string>;
        __e2eConfig?: { e2e: boolean };
      };
    }).btcwallet;
    if (!w) return null;
    return {
      address: await w.getAddress(),
      network: await w.getNetwork(),
      name: await w.getWalletProviderName(),
      isE2E: w.__e2eConfig?.e2e === true,
    };
  });

  expect(probed).not.toBeNull();
  expect(probed!.address).toBe(wallet.address);
  expect(probed!.network).toBe("signet");
  expect(probed!.name).toBe("E2E Mock BTC");
  expect(probed!.isE2E).toBe(true);
});

test("window.btcwallet deriveContextHash is deterministic across calls", async ({
  page,
}) => {
  await mockHealthCheck(page);
  await mockGraphql(page, () => ({ data: { __typename: "Query" } }));
  await mockVpProxy(page);
  await injectBtcWalletProvider(page, {
    address: "tb1qce0n0rv27dwx37dfvhxaaly4lnwelqjuqywvka",
    publicKeyHex: `02${"ab".repeat(32)}`,
    network: "signet",
    providerName: "E2E Mock BTC",
    providerIcon: "data:image/svg+xml;base64,PHN2Zy8+",
    e2e: true,
  });

  await page.goto("/");

  const hashes = await page.evaluate(async () => {
    const w = (window as unknown as {
      btcwallet?: {
        deriveContextHash: (a: string, c: string) => Promise<string>;
      };
    }).btcwallet;
    if (!w) return null;
    const a = await w.deriveContextHash("babylon-vault", "ctx-1");
    const b = await w.deriveContextHash("babylon-vault", "ctx-1");
    const c = await w.deriveContextHash("babylon-vault", "ctx-2");
    return { a, b, c };
  });

  expect(hashes).not.toBeNull();
  expect(hashes!.a).toBe(hashes!.b);
  expect(hashes!.a).not.toBe(hashes!.c);
  expect(hashes!.a).toMatch(/^[0-9a-f]{64}$/);
});

test("installWalletSentinel fixture wires window.btcwallet from a seeded wallet", async ({
  page,
  seededBtcWallet,
  installWalletSentinel,
}) => {
  const wallet = seededBtcWallet({ amount: 100_000n });
  await mockHealthCheck(page);
  await mockGraphql(page, () => ({ data: { __typename: "Query" } }));
  await mockVpProxy(page);
  await mockMempoolForSeededBtcWallet(page, wallet);
  await installWalletSentinel({ btc: wallet });

  await page.goto("/");

  const addressOnPage = await page.evaluate(async () => {
    const w = (window as unknown as {
      btcwallet?: { getAddress: () => Promise<string> };
    }).btcwallet;
    return w ? w.getAddress() : null;
  });

  expect(addressOnPage).toBe(wallet.address);
});
