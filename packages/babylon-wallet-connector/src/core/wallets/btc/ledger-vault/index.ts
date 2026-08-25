import { Network, type BTCConfig, type IBTCProvider, type WalletMetadata } from "@/core/types";
import { MONOCHROME_MARK_BACKGROUND } from "@/core/wallets/constants";

import logo from "./logo.svg";
import { LedgerVaultProvider, WALLET_PROVIDER_NAME } from "./provider";

/**
 * Ledger's dedicated vault app over the DMK — separate from the `ledger_btc*`
 * staking adapters. Nothing is injected into the page; the `wallet` probe
 * reports installed only where WebHID exists (`navigator.hid` — Chromium,
 * secure context; the DMK web-hid transport needs it). Hidden unless
 * `NEXT_PUBLIC_FF_ENABLE_LEDGER_VAULT_WALLET` is "true" — gating lives in the
 * consuming app, where env access exists.
 */
const metadata: WalletMetadata<IBTCProvider, BTCConfig> = {
  id: "ledger_btc_vault",
  wallet: (context) => (context?.navigator?.hid ? context : null),
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
