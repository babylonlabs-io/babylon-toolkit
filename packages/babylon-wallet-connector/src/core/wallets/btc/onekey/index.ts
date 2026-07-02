import { IBTCProvider, Network, type BTCConfig, type WalletMetadata } from "@/core/types";

import logo from "./logo.svg";
import { OneKeyProvider, WALLET_PROVIDER_NAME } from "./provider";

const ONEKEY_BRAND_GREEN = "#1FE121";

const metadata: WalletMetadata<IBTCProvider, BTCConfig> = {
  id: "onekey",
  name: WALLET_PROVIDER_NAME,
  icon: logo,
  iconBackground: ONEKEY_BRAND_GREEN,
  docs: "https://onekey.so/download",
  wallet: "$onekey",
  createProvider: (wallet, config) => new OneKeyProvider(wallet, config),
  networks: [Network.MAINNET, Network.SIGNET],
};

export default metadata;
