import type { BBNConfig } from "@babylonlabs-io/wallet-connector";

import babyLogo from "@/ui/common/assets/baby.png";

import { bbnCanary } from "./bbn/canary";
import { bbnCanonDevnet } from "./bbn/canon-devnet";
import { bbnMainnet } from "./bbn/mainnet";
import { bbnTestnet } from "./bbn/testnet";

interface ExtendedBBNConfig extends BBNConfig {
  displayUSD: boolean;
  logo: string;
  lcdUrl: string;
}

const defaultNetwork = "canonDevnet";
export const network = process.env.NEXT_PUBLIC_NETWORK ?? defaultNetwork;

const config: Record<string, ExtendedBBNConfig> = {
  mainnet: {
    chainId: bbnMainnet.chainId,
    rpc: bbnMainnet.rpc,
    chainData: bbnMainnet,
    networkName: "BABY",
    networkFullName: "Babylon Genesis",
    coinSymbol: "BABY",
    displayUSD: true,
    logo: babyLogo,
    lcdUrl: bbnMainnet.rest,
  },
  canary: {
    chainId: bbnCanary.chainId,
    rpc: bbnCanary.rpc,
    chainData: bbnCanary,
    networkName: "BABY",
    networkFullName: "Babylon Genesis",
    coinSymbol: "BABY",
    displayUSD: true,
    logo: babyLogo,
    lcdUrl: bbnCanary.rest,
  },
  canonDevnet: {
    chainId: bbnCanonDevnet.chainId,
    rpc: bbnCanonDevnet.rpc,
    chainData: bbnCanonDevnet,
    networkName: "Testnet BABY",
    networkFullName: "Testnet Babylon Genesis",
    coinSymbol: "tBABY",
    displayUSD: false,
    logo: babyLogo,
    lcdUrl: bbnCanonDevnet.rest,
  },
  testnet: {
    chainId: bbnTestnet.chainId,
    rpc: bbnTestnet.rpc,
    chainData: bbnTestnet,
    networkName: "Testnet BABY",
    networkFullName: "Testnet Babylon Genesis",
    coinSymbol: "tBABY",
    displayUSD: false,
    logo: babyLogo,
    lcdUrl: bbnTestnet.rest,
  },
  localhost: {
    chainId: bbnCanonDevnet.chainId,
    rpc: bbnCanonDevnet.rpc,
    chainData: bbnCanonDevnet,
    networkName: "Testnet BABY",
    networkFullName: "Testnet Babylon Genesis",
    coinSymbol: "tBABY",
    displayUSD: false,
    logo: babyLogo,
    lcdUrl: bbnCanonDevnet.rest,
  },
};

export function getNetworkConfigBBN(): ExtendedBBNConfig {
  return config[network] ?? config[defaultNetwork];
}
