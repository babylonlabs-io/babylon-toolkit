import { Keplr } from "@keplr-wallet/provider-extension";

import { IBBNProvider, Network, type BBNConfig, type WalletMetadata } from "@/core/types";

import logo from "./logo.svg";
import { KeplrProvider, WALLET_PROVIDER_NAME } from "./provider";

const metadata: WalletMetadata<IBBNProvider, BBNConfig> = {
  id: "keplr",
  name: WALLET_PROVIDER_NAME,
  icon: logo,
  docs: "https://www.keplr.app/",
  wallet: () => Keplr.getKeplr(),
  createProvider: (wallet, config) => new KeplrProvider(wallet, config),
  networks: [Network.MAINNET, Network.SIGNET],
};

export default metadata;
