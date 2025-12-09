import { IBTCProvider, Network, type BTCConfig, type WalletMetadata } from "@/core/types";

import logo from "./logo.svg";
import { LedgerProviderV2, WALLET_PROVIDER_NAME } from "./provider";

const metadata: WalletMetadata<IBTCProvider, BTCConfig> = {
  id: "ledger_btc_v2",
  name: WALLET_PROVIDER_NAME,
  icon: logo,
  docs: "https://www.ledger.com/ledger-live",
  createProvider: (wallet, config) => new LedgerProviderV2(wallet, config),
  networks: [Network.SIGNET, Network.MAINNET],
  label: "Hardware wallet",
};

export default metadata;
