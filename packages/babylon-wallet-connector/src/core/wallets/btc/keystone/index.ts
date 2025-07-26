import { IBTCProvider, Network, type BTCConfig, type WalletMetadata } from "@/core/types";

import logo from "./logo.svg";
import { KeystoneProvider, WALLET_PROVIDER_NAME } from "./provider";

const metadata: WalletMetadata<IBTCProvider, BTCConfig> = {
  id: "keystone",
  name: WALLET_PROVIDER_NAME,
  icon: logo,
  docs: "https://www.keyst.one/btc-only",
  createProvider: (wallet, config) => new KeystoneProvider(wallet, config),
  networks: [Network.MAINNET, Network.SIGNET],
  label: "Hardware wallet",
};

export default metadata;
