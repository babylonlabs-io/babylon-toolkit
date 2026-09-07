import { Network, type BTCConfig, type IBTCProvider, type WalletMetadata } from "@/core/types";
import { MONOCHROME_MARK_BACKGROUND } from "@/core/wallets/constants";

import logo from "./logo.svg";
import { LedgerVaultProvider, WALLET_PROVIDER_NAME } from "./provider";

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
};

export default metadata;
