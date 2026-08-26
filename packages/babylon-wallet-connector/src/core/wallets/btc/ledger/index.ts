import { IBTCProvider, Network, type BTCConfig, type WalletMetadata } from "@/core/types";
import { MONOCHROME_MARK_BACKGROUND } from "@/core/wallets/constants";

import logo from "./logo.svg";
import { LedgerProvider, WALLET_PROVIDER_NAME } from "./provider";

const metadata: WalletMetadata<IBTCProvider, BTCConfig> = {
  id: "ledger_btc",
  name: WALLET_PROVIDER_NAME,
  icon: logo,
  iconBackground: MONOCHROME_MARK_BACKGROUND,
  docs: "https://www.ledger.com/ledger-live",
  createProvider: (wallet, config) => new LedgerProvider(wallet, config),
  networks: [Network.SIGNET, Network.MAINNET],
  label: "Hardware wallet",
  hardware: true,
};

export default metadata;
