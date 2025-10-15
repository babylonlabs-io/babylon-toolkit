import type { ETHConfig } from "@babylonlabs-io/wallet-connector";
import { sepolia } from "viem/chains";
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
  // Devnet - uses Sepolia testnet
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
  // Local development - uses Anvil
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

/**
 * Map chainId to viem Chain object
 * Internal helper function
 */
function getChainFromConfig(ethConfig: Config): Chain {
  switch (ethConfig.chainId) {
    case 11155111:
      return sepolia; // Devnet uses Sepolia
    case 31337:
      return localhost; // Local development uses Anvil
    default:
      // Default to Sepolia for devnet
      return sepolia;
  }
}

export function getNetworkConfigETH(): Config {
  // Use NEXT_PUBLIC_NETWORK to determine ETH configuration
  // This ensures consistency across BTC, BBN, and ETH networks
  return config[network] ?? config[defaultNetwork];
}

/**
 * Get viem Chain object for the current network configuration
 * Used by contract clients and AppKit that need Chain object
 *
 * This function maps the current NEXT_PUBLIC_NETWORK to the corresponding viem chain
 */
export function getETHChain(): Chain {
  const ethConfig = getNetworkConfigETH();
  return getChainFromConfig(ethConfig);
}

/**
 * Get both ETH network config and viem Chain object together
 * This is more efficient than calling getNetworkConfigETH() and getETHChain() separately
 * since it only reads the config once
 *
 * @returns Object containing both config and chain
 */
export function getETHNetworkConfig(): { config: Config; chain: Chain } {
  const ethConfig = getNetworkConfigETH();
  return {
    config: ethConfig,
    chain: getChainFromConfig(ethConfig),
  };
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
