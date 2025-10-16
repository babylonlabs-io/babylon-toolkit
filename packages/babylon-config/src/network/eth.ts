import type { ETHConfig } from "@babylonlabs-io/wallet-connector";
import { mainnet, sepolia } from "viem/chains";
import type { Chain } from "viem";
import { defineChain } from "viem";

// Define localhost/Anvil chain (31337) since viem's localhost is 1337
export const localhost = defineChain({
  id: 31337,
  name: 'Localhost',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: {
      http: ['http://127.0.0.1:8545'],
    },
  },
});

const defaultNetwork = "devnet";
// Export network for modules that need to know which network is active
export const network = process.env.NEXT_PUBLIC_NETWORK ?? defaultNetwork;

// Extended config type for UI-specific properties
export type ExtendedETHConfig = ETHConfig & {
  name: string;
  displayUSD: boolean;
};

type Config = ExtendedETHConfig;

const config: Record<string, Config> = {
  devnet: {
    name: "Ethereum Sepolia",
    chainId: 11155111,
    chainName: "Sepolia Testnet",
    rpcUrl: process.env.NEXT_PUBLIC_ETH_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
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
    rpcUrl: process.env.NEXT_PUBLIC_ETH_RPC_URL || "http://localhost:8545",
    explorerUrl: "",
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
    },
    displayUSD: false,
  },
};

export function getNetworkConfigETH(): Config {
  return config[network] ?? config[defaultNetwork];
}

/**
 * Get viem Chain object for the current network configuration
 * Used by contract clients that need Chain object
 */
export function getETHChain(): Chain {
  const config = getNetworkConfigETH();

  // Map chainId to viem chain object
  switch (config.chainId) {
    case 1:
      return mainnet;
    case 11155111:
      return sepolia;
    case 31337:
      return localhost;
    default:
      // Default to testnet (Sepolia)
      return sepolia;
  }
}

/**
 * Validate Ethereum address format
 * @param address - Address to validate
 * @throws Error if address format is invalid
 */
export function validateETHAddress(address: string): void {
  // Basic ETH address validation
  if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
    throw new Error(
      "Invalid Ethereum address format. Expected address to start with '0x' followed by 40 hexadecimal characters."
    );
  }

  // TODO: Add checksum validation when needed
}
