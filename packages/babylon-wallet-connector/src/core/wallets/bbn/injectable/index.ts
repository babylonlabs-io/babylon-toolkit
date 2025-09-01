import { IBBNProvider, Network, type BBNConfig, type WalletMetadata } from "@/core/types";

const metadata: WalletMetadata<IBBNProvider, BBNConfig> = {
  id: "injectable",
  name: (wallet) => wallet.getWalletProviderName?.(),
  icon: (wallet) => wallet.getWalletProviderIcon?.(),
  docs: "",
  wallet: "bbnwallet",
  createProvider: (wallet) => wallet,
  networks: [Network.MAINNET, Network.SIGNET],
  label: "Injectable",
};

export default metadata;
