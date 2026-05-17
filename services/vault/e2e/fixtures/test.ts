/* eslint-disable react-hooks/rules-of-hooks --
 * Playwright's fixture API is `(deps, use) => ...`. The `use` callback
 * is unrelated to React's `use` hook but the rule cannot tell them
 * apart. This file is exclusively Playwright fixture wiring.
 */

/**
 * Playwright `test` extended with the vault e2e fixtures.
 *
 * Tests import `test` and `expect` from here instead of
 * `@playwright/test`. Each fixture is opt-in: wallets, page objects,
 * and route handlers are only constructed when a test names them.
 *
 * Page objects are thin wrappers around Playwright locators - they
 * navigate and click, they do not assert. Tests own assertions.
 *
 * Each test starts clean: Playwright tears down `page` between tests,
 * so `window.__BABYLON_E2E_WALLETS__` and any `page.route()` handlers
 * reset automatically. There is no shared in-memory state to reset
 * between tests.
 */

import { test as base, expect, type Page } from "@playwright/test";

import { AppShell } from "../pages/AppShell";
import { Dashboard } from "../pages/Dashboard";
import { DepositModal } from "../pages/DepositModal";
import { WithdrawModal } from "../pages/WithdrawModal";

import {
  seededBtcWallet,
  seededEthWallet,
  type SeededBtcWallet,
  type SeededBtcWalletOptions,
  type SeededEthWallet,
  type SeededEthWalletOptions,
} from "./seededWallets";
import { E2E_WALLETS_GLOBAL } from "./walletInjection";
import {
  btcWalletConfigFromSeeded,
  injectBtcWalletProvider,
} from "./walletPageInjection";

export interface VaultE2EFixtures {
  /** Build a seeded BTC wallet with a declared balance. */
  seededBtcWallet: (options: SeededBtcWalletOptions) => SeededBtcWallet;
  /** Build a seeded ETH wallet with a declared balance. */
  seededEthWallet: (options: SeededEthWalletOptions) => SeededEthWallet;
  /**
   * Install a JSON-only sentinel describing the seeded wallets on
   * `window.__BABYLON_E2E_WALLETS__` before the next navigation. This
   * does NOT install usable provider objects: closures (provider
   * methods, script queues) do not survive structured-clone across the
   * Node/browser boundary, so the page-side payload is the sentinel
   * shape `{ kind, address }`, not the full `MockBtcWallet`/
   * `MockEthWallet`. Full page-side provider construction is the
   * responsibility of #1592 (single-vault deposit happy-path); here
   * the sentinel proves the bridge fires before navigation.
   */
  installWalletSentinel: (wallets: {
    btc?: SeededBtcWallet | null;
    eth?: SeededEthWallet | null;
  }) => Promise<void>;
  appShell: AppShell;
  dashboard: Dashboard;
  depositModal: DepositModal;
  withdrawModal: WithdrawModal;
}

interface WalletSentinel {
  kind: "seeded-btc" | "seeded-eth";
  address?: string;
}

interface WalletSentinelPayload {
  btc?: WalletSentinel;
  eth?: WalletSentinel;
}

async function installWalletSentinelOnPage(
  page: Page,
  globalName: string,
  payload: WalletSentinelPayload,
): Promise<void> {
  // The sentinel records that a wallet was requested by the test, for
  // diagnostic / introspection use. Actual `window.btcwallet` wiring
  // happens via `installBtcOnPage` below - the wallet-connector reads
  // from that exact global. ETH provider injection still waits on
  // mocking Reown's AppKit (deferred to a follow-up).
  await page.addInitScript(
    ({ globalName: name, sentinel }) => {
      (window as unknown as Record<string, unknown>)[name] = sentinel;
    },
    { globalName, sentinel: payload },
  );
}

async function installBtcOnPage(
  page: Page,
  wallet: SeededBtcWallet,
): Promise<void> {
  await injectBtcWalletProvider(page, btcWalletConfigFromSeeded(wallet));
}

function toSentinel(
  wallet: SeededBtcWallet | SeededEthWallet | null | undefined,
  kind: "seeded-btc" | "seeded-eth",
): WalletSentinel | undefined {
  if (!wallet) return undefined;
  if (kind === "seeded-btc") {
    return { kind, address: (wallet as SeededBtcWallet).address };
  }
  return { kind, address: (wallet as SeededEthWallet).account.address };
}

export const test = base.extend<VaultE2EFixtures>({
  // eslint-disable-next-line no-empty-pattern -- Playwright fixture signature requires destructure even with no deps
  seededBtcWallet: async ({}, use) => {
    await use(seededBtcWallet);
  },
  // eslint-disable-next-line no-empty-pattern -- see above
  seededEthWallet: async ({}, use) => {
    await use(seededEthWallet);
  },
  installWalletSentinel: async ({ page }, use) => {
    await use(async (wallets) => {
      await installWalletSentinelOnPage(page, E2E_WALLETS_GLOBAL, {
        btc: toSentinel(wallets.btc, "seeded-btc"),
        eth: toSentinel(wallets.eth, "seeded-eth"),
      });
      if (wallets.btc) {
        await installBtcOnPage(page, wallets.btc);
      }
    });
  },
  appShell: async ({ page }, use) => {
    await use(new AppShell(page));
  },
  dashboard: async ({ page }, use) => {
    await use(new Dashboard(page));
  },
  depositModal: async ({ page }, use) => {
    await use(new DepositModal(page));
  },
  withdrawModal: async ({ page }, use) => {
    await use(new WithdrawModal(page));
  },
});

export { expect };
