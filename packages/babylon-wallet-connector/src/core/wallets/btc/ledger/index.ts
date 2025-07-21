import { IBTCProvider, Network, type BTCConfig, type WalletMetadata } from "@/core/types";

import logo from "./logo.svg";
import { LedgerProvider, WALLET_PROVIDER_NAME } from "./provider";

const metadata: WalletMetadata<IBTCProvider, BTCConfig> = {
  id: "ledget_btc",
  name: WALLET_PROVIDER_NAME,
  icon: logo,
  docs: "https://www.ledger.com/ledger-live",
  createProvider: (wallet, config) => new LedgerProvider(wallet, config),
  networks: [Network.SIGNET, Network.MAINNET],
  label: "Hardware wallet",
};

export default metadata;
