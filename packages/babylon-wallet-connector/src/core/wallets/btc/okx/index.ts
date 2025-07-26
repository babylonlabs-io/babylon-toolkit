import { IBTCProvider, Network, type BTCConfig, type WalletMetadata } from "@/core/types";

import logo from "./logo.svg";
import { OKXProvider, WALLET_PROVIDER_NAME } from "./provider";

const metadata: WalletMetadata<IBTCProvider, BTCConfig> = {
  id: "okx",
  name: WALLET_PROVIDER_NAME,
  icon: logo,
  docs: "https://www.okx.com/web3",
  wallet: "okxwallet",
  createProvider: (wallet, config) => new OKXProvider(wallet, config),
  networks: [Network.MAINNET, Network.SIGNET],
};

export default metadata;
