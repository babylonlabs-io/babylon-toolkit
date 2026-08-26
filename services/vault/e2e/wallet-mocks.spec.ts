/**
 * Demonstrates the e2e wallet-mock contract:
 *   - the mock factories produce deterministic values under Playwright;
 *   - the `window.__BABYLON_E2E_WALLETS__` injection global is readable
 *     from the page context after `page.addInitScript`.
 *
 * The actual integration with vault's wallet hooks (so that
 * `useChainConnector` returns the mocked provider) happens in the
 * single-vault deposit happy-path ticket - this spec is the
 * minimum end-to-end proof that the building blocks reach the page.
 */

import { expect, test } from "@playwright/test";

import {
  E2E_WALLETS_GLOBAL,
  createMockBtcWallet,
  createMockEthWallet,
} from "./fixtures";

test("mock factories produce deterministic outputs in node context", async () => {
  const { provider } = createMockBtcWallet();
  const address = await provider.getAddress();
  expect(address).toBe(await provider.getAddress());

  const { account } = createMockEthWallet();
  expect(account.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
});

test("page.addInitScript can install the e2e wallet global before navigation", async ({
  page,
}) => {
  await page.addInitScript((globalName: string) => {
    (
      window as unknown as Record<string, { btc: { sentinel: string } }>
    )[globalName] = {
      btc: { sentinel: "installed-pre-navigation" },
    };
  }, E2E_WALLETS_GLOBAL);

  await page.goto("/");

  const sentinel = await page.evaluate((globalName) => {
    const installed = (
      window as unknown as Record<
        string,
        { btc?: { sentinel?: string } } | undefined
      >
    )[globalName];
    return installed?.btc?.sentinel ?? null;
  }, E2E_WALLETS_GLOBAL);

  expect(sentinel).toBe("installed-pre-navigation");
});

test("page-context window has no e2e wallet global by default", async ({
  page,
}) => {
  await page.goto("/");
  const installed = await page.evaluate((globalName) => {
    const w = window as unknown as Record<string, unknown>;
    return typeof w[globalName];
  }, E2E_WALLETS_GLOBAL);
  expect(installed).toBe("undefined");
});
