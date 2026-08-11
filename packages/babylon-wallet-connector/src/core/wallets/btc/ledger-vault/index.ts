import { Network, type BTCConfig, type IBTCProvider, type WalletMetadata } from "@/core/types";
import { MONOCHROME_MARK_BACKGROUND } from "@/core/wallets/constants";

import logo from "./logo.svg";
import { LedgerVaultProvider, WALLET_PROVIDER_NAME } from "./provider";

/**
 * Ledger's dedicated vault app, driven over the Device Management Kit.
 *
 * Separate from the `ledger_btc` / `ledger_btc_v2` staking adapters: a different
 * device app, a different transport stack, and an intent-approval ceremony
 * instead of wallet policies. Requires WebHID, so Chromium and a secure context.
 *
 * No `wallet` field: like the other hardware wallets there is nothing injected
 * into the page to detect, so the connector constructs the provider
 * unconditionally and the entry is always "installed".
 *
 * Hidden unless `NEXT_PUBLIC_FF_ENABLE_LEDGER_VAULT_WALLET` is "true" — the
 * gating lives in the consuming app, which is where env access exists.
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
