import { Network, type BTCConfig, type ConnectGuide, type IBTCProvider, type WalletMetadata } from "@/core/types";
import { MONOCHROME_MARK_BACKGROUND } from "@/core/wallets/constants";

import logo from "./logo.svg";
import { APP_NAME_BY_NETWORK, LedgerVaultProvider, WALLET_PROVIDER_NAME } from "./provider";

/**
 * Both vault apps are listed only under Ledger Wallet's (formerly Ledger Live)
 * "My Ledger provider" 4 until Ledger promotes them to provider 1, so stock
 * Ledger Wallet does not show them (#2110). Drop the provider step from
 * `installSteps` once they move.
 */
const LEDGER_WALLET_APP_PROVIDER = 4;

const connectGuide = ({ network }: BTCConfig): ConnectGuide => {
  const appName = APP_NAME_BY_NETWORK[network];
  return {
    steps: [
      "Plug in your Ledger and unlock it with your PIN.",
      `Open the ${appName} app on your Ledger.`,
      "Close Ledger Wallet (formerly Ledger Live) if it is open. It can take over the connection to your Ledger.",
      "Select Connect. If your browser asks, choose your Ledger.",
    ],
    installSteps: [
      `In Ledger Wallet, open Settings → Experimental features. Turn on My Ledger provider and set it to ${LEDGER_WALLET_APP_PROVIDER}.`,
      `Go to My Ledger and install the ${appName} app.`,
      "Then close Ledger Wallet and follow the steps at the top.",
    ],
  };
};

/**
 * Ledger's dedicated vault app over the DMK — separate from the `ledger_btc*`
 * staking adapters. Nothing is injected into the page, so like the other
 * hardware entries there is no `wallet` probe: `installed: false` would not
 * remove a `hardware` row from the connect list (`Wallets` filters on it only
 * for `injectable`), it would just leave a clickable row that throws
 * "Provider not found". Availability gating — the feature flag AND WebHID
 * (`navigator.hid`, which the DMK web-hid transport needs) — lives in the
 * consuming app's disabled-wallets list, where env access exists.
 */
const metadata: WalletMetadata<IBTCProvider, BTCConfig> = {
  id: "ledger_btc_vault",
  name: WALLET_PROVIDER_NAME,
  icon: logo,
  iconBackground: MONOCHROME_MARK_BACKGROUND,
  docs: "https://www.ledger.com",
  createProvider: (_wallet, config) => new LedgerVaultProvider(config.network),
  networks: [Network.MAINNET, Network.SIGNET],
  label: "Hardware wallet",
  hardware: true,
  connectGuide,
};

export default metadata;
