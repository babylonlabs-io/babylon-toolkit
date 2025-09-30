import type { ETHConfig } from "@babylonlabs-io/wallet-connector";

import ethereumIcon from "@/ui/common/assets/ethereum.svg";
import { ClientError, ERROR_CODES } from "@/ui/common/errors";

const defaultNetwork = "testnet";
export const network = process.env.NEXT_PUBLIC_NETWORK ?? defaultNetwork;

type Config = ETHConfig & { icon: string; name: string; displayUSD: boolean };

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
  devnet: {
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
};

export function getNetworkConfigETH(): Config {
  // Use the chain ID from environment if available
  const chainId = parseInt(process.env.NEXT_PUBLIC_ETH_CHAIN_ID || "0");

  // If chain ID is set and is mainnet, use mainnet config
  if (chainId === 1) {
    return config.mainnet;
  }

  // Otherwise use the network-based config
  return config[network] ?? config[defaultNetwork];
}

export function validateETHAddress(address: string): void {
  // Basic ETH address validation
  if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
    throw new ClientError(
      ERROR_CODES.VALIDATION_ERROR,
      "Invalid Ethereum address format. Expected address to start with '0x' followed by 40 hexadecimal characters.",
    );
  }

  // TODO: Add checksum validation when needed
}
