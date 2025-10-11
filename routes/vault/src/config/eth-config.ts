import { sepolia, mainnet, type Chain } from "viem/chains";
import { defineChain } from "viem";

// Define localhost chain
export const localhost = defineChain({
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
export const network =
  (import.meta.env.NEXT_PUBLIC_NETWORK as string) || "mainnet";

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

// Get network config for ETH
export function getNetworkConfigETH(): ExtendedETHConfig {
  const config: Record<string, ExtendedETHConfig> = {
    mainnet: {
      name: "Ethereum",
      chainId: 1,
      chainName: "Ethereum Mainnet",
      rpcUrl: import.meta.env.NEXT_PUBLIC_ETH_RPC_URL || "https://eth.llamarpc.com",
      explorerUrl: "https://etherscan.io",
      nativeCurrency: {
        name: "Ether",
        symbol: "ETH",
        decimals: 18,
      },
      displayUSD: true,
    },
    canary: {
      name: "Ethereum Sepolia",
      chainId: 11155111,
      chainName: "Sepolia Testnet",
      rpcUrl: import.meta.env.NEXT_PUBLIC_ETH_RPC_URL || "https://rpc.sepolia.org",
      explorerUrl: "https://sepolia.etherscan.io",
      nativeCurrency: {
        name: "Sepolia ETH",
        symbol: "ETH",
        decimals: 18,
      },
      displayUSD: false,
    },
    testnet: {
      name: "Ethereum Sepolia",
      chainId: 11155111,
      chainName: "Sepolia Testnet",
      rpcUrl: import.meta.env.NEXT_PUBLIC_ETH_RPC_URL || "https://rpc.sepolia.org",
      explorerUrl: "https://sepolia.etherscan.io",
      nativeCurrency: {
        name: "Sepolia ETH",
        symbol: "ETH",
        decimals: 18,
      },
      displayUSD: false,
    },
    canonDevnet: {
      name: "Ethereum Sepolia",
      chainId: 11155111,
      chainName: "Sepolia Testnet",
      rpcUrl: import.meta.env.NEXT_PUBLIC_ETH_RPC_URL || "https://rpc.sepolia.org",
      explorerUrl: "https://sepolia.etherscan.io",
      nativeCurrency: {
        name: "Sepolia ETH",
        symbol: "ETH",
        decimals: 18,
      },
      displayUSD: false,
    },
    localhost: {
      name: "Local Anvil",
      chainId: 31337,
      chainName: "Localhost",
      rpcUrl: import.meta.env.NEXT_PUBLIC_ETH_RPC_URL || "http://localhost:8545",
      explorerUrl: "",
      nativeCurrency: {
        name: "Ether",
        symbol: "ETH",
        decimals: 18,
      },
      displayUSD: false,
    },
  };

  const networkKey = network === "localhost" ? "localhost" : network;
  return config[networkKey] ?? config.mainnet;
}

// Validate ETH address
export function validateETHAddress(address: string): void {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error("Invalid Ethereum address");
  }
}
