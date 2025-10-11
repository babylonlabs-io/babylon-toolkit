import { sepolia, mainnet, type Chain } from "viem/chains";
import { defineChain } from "viem";

import ethereumIcon from "@/ui/common/assets/ethereum.svg";
import { ClientError, ERROR_CODES } from "@/ui/common/errors";

// Define localhost chain
const localhost = defineChain({
  id: 31337,
  name: "Localhost",
  network: "localhost",
  nativeCurrency: {
    decimals: 18,
    name: "Ether",
    symbol: "ETH",
  },
  rpcUrls: {
    default: { http: ["http://localhost:8545"] },
    public: { http: ["http://localhost:8545"] },
  },
});

// Network configuration
export const network = (process.env.NEXT_PUBLIC_NETWORK as string) || "mainnet";

// Get ETH chain based on network
export function getETHChain(): Chain {
  switch (network) {
    case "mainnet":
      return mainnet;
    case "canary":
    case "testnet":
    case "canonDevnet":
      return sepolia;
    case "localhost":
      return localhost;
    default:
      return mainnet;
  }
}

// Validate ETH address
function baseValidateETHAddress(address: string): void {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error("Invalid Ethereum address");
  }
}

export interface ExtendedETHConfig {
  name: string;
  chainId: number;
  chainName: string;
  rpcUrl: string;
  explorerUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  displayUSD?: boolean;
}

type Config = ExtendedETHConfig & { icon: string };

const config: Record<string, Config> = {
  mainnet: {
    name: "Ethereum",
    chainId: 1,
    chainName: "Ethereum Mainnet",
    rpcUrl: process.env.NEXT_PUBLIC_ETH_RPC_URL || "https://eth.llamarpc.com",
    explorerUrl: "https://etherscan.io",
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
    },
    icon: ethereumIcon,
    displayUSD: true,
  },
  canary: {
    // Using Sepolia for canary
    name: "Ethereum Sepolia",
    chainId: 11155111,
    chainName: "Sepolia Testnet",
    rpcUrl: process.env.NEXT_PUBLIC_ETH_RPC_URL || "https://rpc.sepolia.org",
    explorerUrl: "https://sepolia.etherscan.io",
    nativeCurrency: {
      name: "Sepolia ETH",
      symbol: "ETH",
      decimals: 18,
    },
    icon: ethereumIcon,
    displayUSD: false,
  },
  testnet: {
    name: "Ethereum Sepolia",
    chainId: 11155111,
    chainName: "Sepolia Testnet",
    rpcUrl: process.env.NEXT_PUBLIC_ETH_RPC_URL || "https://rpc.sepolia.org",
    explorerUrl: "https://sepolia.etherscan.io",
    nativeCurrency: {
      name: "Sepolia ETH",
      symbol: "ETH",
      decimals: 18,
    },
    icon: ethereumIcon,
    displayUSD: false,
  },
  canonDevnet: {
    name: "Ethereum Sepolia",
    chainId: 11155111,
    chainName: "Sepolia Testnet",
    rpcUrl: process.env.NEXT_PUBLIC_ETH_RPC_URL || "https://rpc.sepolia.org",
    explorerUrl: "https://sepolia.etherscan.io",
    nativeCurrency: {
      name: "Sepolia ETH",
      symbol: "ETH",
      decimals: 18,
    },
    icon: ethereumIcon,
    displayUSD: false,
  },
  localhost: {
    name: "Local Anvil",
    chainId: 31337,
    chainName: "Localhost",
    rpcUrl: process.env.NEXT_PUBLIC_ETH_RPC_URL || "http://localhost:8545",
    explorerUrl: "",
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
    },
    icon: ethereumIcon,
    displayUSD: false,
  },
};

/**
 * Get network config with icon for UI
 * Wraps the base config and adds the icon
 */
export function getNetworkConfigETH(): Config {
  const networkKey = network === "localhost" ? "localhost" : network;
  return config[networkKey] ?? config.mainnet;
}

/**
 * Validate ETH address with ClientError wrapper
 * Wraps base validation with application-specific error handling
 */
export function validateETHAddress(address: string): void {
  try {
    baseValidateETHAddress(address);
  } catch (error) {
    throw new ClientError(
      ERROR_CODES.VALIDATION_ERROR,
      error instanceof Error ? error.message : "Invalid Ethereum address",
    );
  }
}
