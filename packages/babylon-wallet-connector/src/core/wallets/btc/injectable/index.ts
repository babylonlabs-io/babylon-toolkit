import { IBTCProvider, Network, type BTCConfig, type WalletMetadata } from "@/core/types";

const metadata: WalletMetadata<IBTCProvider, BTCConfig> = {
  id: "injectable",
  name: (wallet) => wallet.getWalletProviderName?.(),
  icon: (wallet) => wallet.getWalletProviderIcon?.(),
  docs: "",
  wallet: "btcwallet",
  createProvider: (wallet) => wallet,
  networks: [Network.MAINNET, Network.SIGNET],
  label: "Injectable",
};

export default metadata;
