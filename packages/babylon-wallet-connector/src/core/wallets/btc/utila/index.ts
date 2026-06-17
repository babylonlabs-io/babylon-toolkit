import { IBTCProvider, Network, type BTCConfig, type WalletMetadata } from "@/core/types";

import logo from "./logo.svg";
import { UtilaProvider, WALLET_PROVIDER_NAME } from "./provider";

const metadata: WalletMetadata<IBTCProvider, BTCConfig> = {
  id: "utila",
  name: WALLET_PROVIDER_NAME,
  icon: logo,
  docs: "https://utila.io",
  // Utila injects its BTC provider at `window.utila.bitcoin`; the connector
  // resolves `window.utila` and `UtilaProvider` reads `.bitcoin`.
  wallet: "utila",
  createProvider: (wallet) => new UtilaProvider(wallet),
  networks: [Network.MAINNET, Network.SIGNET],
};

export default metadata;
