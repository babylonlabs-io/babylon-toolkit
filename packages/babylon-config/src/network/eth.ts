/**
 * Ethereum Network Configuration
 *
 * Provides network configuration for Ethereum based on NEXT_PUBLIC_ETH_CHAINID.
 * Supports mainnet (1) and sepolia testnet (11155111).
 *
 * Required environment variables:
 * - NEXT_PUBLIC_ETH_CHAINID: Must be "1" (mainnet) or "11155111" (sepolia)
 * - NEXT_PUBLIC_ETH_RPC_URL: Ethereum RPC endpoint that can see the deployed
 *   contracts. No default — public RPCs (drpc.org, publicnode.com) do not see
 *   contracts on private/devnet deployments and silently produce misleading
 *   "contract call failed" errors.
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

const rawEthRpcUrl = process.env.NEXT_PUBLIC_ETH_RPC_URL;

if (!rawEthRpcUrl) {
  throw new Error(
    "NEXT_PUBLIC_ETH_RPC_URL environment variable is required. Set it to an RPC endpoint that can see the deployed contracts (e.g. your devnet RPC). Public RPCs do not see contracts on private deployments.",
  );
}

const ethRpcUrl: string = rawEthRpcUrl;

const chainIdRaw = parseInt(chainIdStr, 10);

if (isNaN(chainIdRaw)) {
  throw new Error(
    `Invalid NEXT_PUBLIC_ETH_CHAINID value: "${chainIdStr}". Must be a valid number.`,
  );
}

export const ETH_MAINNET_CHAIN_ID = 1 as const;
export const ETH_SEPOLIA_CHAIN_ID = 11155111 as const;

if (chainIdRaw !== ETH_MAINNET_CHAIN_ID && chainIdRaw !== ETH_SEPOLIA_CHAIN_ID) {
  throw new Error(
    `Unsupported NEXT_PUBLIC_ETH_CHAINID value: ${chainIdRaw}. Must be either 1 (mainnet) or 11155111 (sepolia).`,
  );
}

// Type is now narrowed to 1 | 11155111 after validation
export const chainId = chainIdRaw as typeof ETH_MAINNET_CHAIN_ID | typeof ETH_SEPOLIA_CHAIN_ID;

// Extended config type for UI-specific properties
export type ExtendedETHConfig = ETHConfig & {
  name: string;
  displayUSD: boolean;
};

type Config = ExtendedETHConfig;

const config: Record<typeof ETH_MAINNET_CHAIN_ID | typeof ETH_SEPOLIA_CHAIN_ID, Config> = {
  [ETH_MAINNET_CHAIN_ID]: {
    name: "Ethereum Mainnet",
    chainId: ETH_MAINNET_CHAIN_ID,
    chainName: "Ethereum Mainnet",
    rpcUrl: ethRpcUrl,
    explorerUrl: "https://etherscan.io",
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
    },
    displayUSD: true,
  },
  [ETH_SEPOLIA_CHAIN_ID]: {
    name: "Ethereum Sepolia",
    chainId: ETH_SEPOLIA_CHAIN_ID,
    chainName: "Sepolia Testnet",
    rpcUrl: ethRpcUrl,
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
 * Get viem Chain object for the current network configuration.
 *
 * Returns the stock viem chain with `rpcUrls.default` overridden by
 * `NEXT_PUBLIC_ETH_RPC_URL`, so any downstream code that calls
 * `http()` without an explicit URL still routes to the configured RPC
 * instead of viem's bundled public default (e.g. `sepolia.drpc.org`).
 *
 * @returns viem Chain object with the configured RPC URL baked in
 * @throws Error if chain ID is not supported
 */
export function getETHChain(): Chain {
  const baseChain =
    chainId === ETH_MAINNET_CHAIN_ID ? mainnet : sepolia;
  // Patch both `default` and `public` so any wagmi/AppKit/Reown internals
  // that build RPC namespace maps from `rpcUrls.public` route through the
  // configured endpoint instead of viem's bundled public RPC.
  return {
    ...baseChain,
    rpcUrls: {
      ...baseChain.rpcUrls,
      default: { http: [ethRpcUrl] },
      public: { http: [ethRpcUrl] },
    },
  };
}

