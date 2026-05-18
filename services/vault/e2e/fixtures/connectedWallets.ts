/**
 * "Pre-connected" wallet helper.
 *
 * The dApp's connect flow is two-modal (BTC then ETH) and ETH connects
 * through Reown's AppKit, which is hostile to e2e drivers. Rather than
 * fight the modal, this helper stages the page so the connect happens
 * on the page-load auto-reconnect path:
 *
 *   - BTC: write `baby-connected-wallet-accounts` localStorage so
 *     `createWalletConnector` re-connects the `"injectable"` adapter
 *     on boot. Combined with `window.btcwallet` installed by
 *     `injectBtcWalletProvider`, the BTC side is connected by the
 *     time React renders the connect UI.
 *   - ETH: in `NEXT_PUBLIC_E2E_MODE=1` the vault's wagmi config
 *     (services/vault/src/config/wagmi.ts) drops in a wagmi `mock`
 *     connector and auto-connects on the next microtask. The
 *     wallet-connector's `AppKitProvider` watches wagmi via
 *     `watchAccount` and emits the wagmi account through the same
 *     channel a real connect would use.
 *
 * Together, calling `preConnectWallets(page, ...)` before
 * `page.goto("/")` lands the test on a "both wallets connected"
 * starting state without ever opening the connect modal.
 */

import type { Page } from "@playwright/test";

import { mockEthRpcForSeededWallet } from "./networkRoutes";
import type { SeededBtcWallet, SeededEthWallet } from "./seededWallets";
import {
  btcWalletConfigFromSeeded,
  injectBtcWalletProvider,
} from "./walletPageInjection";

const ACCOUNTS_KEY = "baby-connected-wallet-accounts";
const BTC_INJECTABLE_ID = "injectable";

export interface PreConnectOptions {
  btc: SeededBtcWallet;
  eth: SeededEthWallet;
  /**
   * Network identifier the dApp scopes localStorage by. Defaults to
   * `"signet"` to match playwright.config.ts's
   * `NEXT_PUBLIC_BTC_NETWORK`. Update both if the e2e BTC network
   * ever changes.
   */
  btcNetwork?: string;
  /**
   * Per-test override for ETH RPC methods beyond the ones
   * `mockEthRpcForSeededWallet` already answers (chainId, blockNumber,
   * getBalance). Useful when a flow needs `eth_call` contract reads.
   */
  ethRpcHandler?: (method: string, params: unknown[]) => unknown;
}

export async function preConnectWallets(
  page: Page,
  options: PreConnectOptions,
): Promise<void> {
  const btcNetwork = options.btcNetwork ?? "signet";
  await mockEthRpcForSeededWallet(page, options.eth, options.ethRpcHandler);
  await injectBtcWalletProvider(
    page,
    btcWalletConfigFromSeeded(options.btc, { network: btcNetwork }),
  );
  // wallet-connector's `createWallet` only instantiates a provider when
  // the wallet's origin (the `wallet:` lookup key on window) is
  // truthy. AppKit's ETH provider ignores the origin object - it
  // reads from the shared wagmi config - but the gate runs first, so
  // an absent `window.ethereum` prevents AppKitProvider from being
  // created at all. Plant a sentinel so the gate passes.
  await page.addInitScript(() => {
    if (!(window as unknown as { ethereum?: unknown }).ethereum) {
      (window as unknown as { ethereum: object }).ethereum = {
        __e2eSentinel: true,
      };
    }
  });
  await page.addInitScript(
    ({ key, scoped, id, now }) => {
      const entry: Record<string, unknown> = {
        [scoped]: id,
        _timestamps: { [scoped]: now },
      };
      localStorage.setItem(key, JSON.stringify(entry));
    },
    {
      key: ACCOUNTS_KEY,
      scoped: `BTC:${btcNetwork}`,
      id: BTC_INJECTABLE_ID,
      now: Date.now(),
    },
  );
  // The ETH address is announced via the test-only override the
  // production wagmi config reads. Setting it here means tests can
  // declare a wallet whose address matches a contract fixture rather
  // than the wagmi.ts default.
  await page.addInitScript((address) => {
    (
      window as unknown as { __BABYLON_E2E_ETH_ADDRESS__?: string }
    ).__BABYLON_E2E_ETH_ADDRESS__ = address;
  }, options.eth.account.address);
}
