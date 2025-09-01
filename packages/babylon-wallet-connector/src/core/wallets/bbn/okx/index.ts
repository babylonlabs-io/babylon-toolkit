import { IBBNProvider, Network, type BBNConfig, type WalletMetadata } from "@/core/types";

import logo from "./logo.svg";
import { OKXBabylonProvider, WALLET_PROVIDER_NAME } from "./provider";

const metadata: WalletMetadata<IBBNProvider, BBNConfig> = {
  id: "okx",
  name: WALLET_PROVIDER_NAME,
  icon: logo,
  docs: "https://www.okx.com/web3",
  wallet: "okxwallet",
  createProvider: (wallet, config) => new OKXBabylonProvider(wallet, config),
  networks: [Network.MAINNET, Network.SIGNET],
};

export default metadata;
