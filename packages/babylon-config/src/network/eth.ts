/**
 * Ethereum Network Configuration
 *
 * Provides network configuration for Ethereum based on NEXT_PUBLIC_ETH_CHAINID.
 * Supports mainnet (1) and sepolia testnet (11155111).
 *
 * Required environment variable:
 * - NEXT_PUBLIC_ETH_CHAINID: Must be "1" (mainnet) or "11155111" (sepolia)
 *
 * Optional environment variable:
 * - NEXT_PUBLIC_ETH_RPC_URL: Custom RPC URL (has defaults for each network)
 */

import type { ETHConfig } from "@babylonlabs-io/wallet-connector";
import { mainnet, sepolia } from "viem/chains";
import type { Chain } from "viem";

// Enforce required environment variable
const chainIdStr = process.env.NEXT_PUBLIC_ETH_CHAINID;

if (!chainIdStr) {
  throw new Error(
    "NEXT_PUBLIC_ETH_CHAINID environment variable is required. Must be set to '1' (mainnet) or '11155111' (sepolia).",
  );
}

const chainIdRaw = parseInt(chainIdStr, 10);

if (isNaN(chainIdRaw)) {
  throw new Error(
    `Invalid NEXT_PUBLIC_ETH_CHAINID value: "${chainIdStr}". Must be a valid number.`,
  );
}

if (chainIdRaw !== 1 && chainIdRaw !== 11155111) {
  throw new Error(
    `Unsupported NEXT_PUBLIC_ETH_CHAINID value: ${chainIdRaw}. Must be either 1 (mainnet) or 11155111 (sepolia).`,
  );
}

// Type is now narrowed to 1 | 11155111 after validation
const chainId = chainIdRaw as 1 | 11155111;

// Extended config type for UI-specific properties
export type ExtendedETHConfig = ETHConfig & {
  name: string;
  displayUSD: boolean;
};

type Config = ExtendedETHConfig;

const config: Record<number, Config> = {
  1: {
    name: "Ethereum Mainnet",
    chainId: 1,
    chainName: "Ethereum Mainnet",
    rpcUrl:
      process.env.NEXT_PUBLIC_ETH_RPC_URL ||
      "https://ethereum-rpc.publicnode.com",
    explorerUrl: "https://etherscan.io",
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
    },
    displayUSD: true,
  },
  11155111: {
    name: "Ethereum Sepolia",
    chainId: 11155111,
    chainName: "Sepolia Testnet",
    rpcUrl:
      process.env.NEXT_PUBLIC_ETH_RPC_URL ||
      "https://ethereum-sepolia-rpc.publicnode.com",
    explorerUrl: "https://sepolia.etherscan.io",
    nativeCurrency: {
      name: "Sepolia ETH",
      symbol: "ETH",
      decimals: 18,
    },
    displayUSD: false,
  },
};

/**
 * Get ETH network configuration based on NEXT_PUBLIC_ETH_CHAINID
 * @returns ETH network config (mainnet or sepolia)
 */
export function getNetworkConfigETH(): Config {
  return config[chainId];
}

/**
 * Get viem Chain object for the current network configuration
 * Used by contract clients that need Chain object
 * @returns viem Chain object (mainnet or sepolia)
 * @throws Error if chain ID is not supported
 */
export function getETHChain(): Chain {
  // Use chainId directly since it's already validated
  switch (chainId) {
    case 1:
      return mainnet;
    case 11155111:
      return sepolia;
    default:
      throw new Error(
        `No viem Chain object found for chain ID: ${chainId}. This should not happen as validation occurs at module load.`,
      );
  }
}

