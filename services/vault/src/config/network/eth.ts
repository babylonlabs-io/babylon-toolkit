/**
 * ETH network configuration.
 *
 * Reads from the runtime configured via `configureBabylonConfig`. Defines
 * its own plain config shape — does NOT depend on wallet-connector types
 * (call sites adapt to wallet-connector's `ETHConfig` if needed).
 */

import type { Chain } from "viem";
import { mainnet, sepolia } from "viem/chains";

import { ETH_MAINNET_CHAIN_ID, ETH_SEPOLIA_CHAIN_ID } from "./constants";
import { getBabylonConfigState } from "./runtime";

export { ETH_MAINNET_CHAIN_ID, ETH_SEPOLIA_CHAIN_ID } from "./constants";

export interface EthNetworkConfig {
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
  displayUSD: boolean;
}

const STATIC_CONFIG: Record<
  typeof ETH_MAINNET_CHAIN_ID | typeof ETH_SEPOLIA_CHAIN_ID,
  Omit<EthNetworkConfig, "rpcUrl">
> = {
  [ETH_MAINNET_CHAIN_ID]: {
    name: "Ethereum Mainnet",
    chainId: ETH_MAINNET_CHAIN_ID,
    chainName: "Ethereum Mainnet",
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
 * Get ETH network configuration for the configured chain.
 * Requires `configureBabylonConfig` to have been called first.
 */
export function getNetworkConfigETH(): EthNetworkConfig {
  const { ethChainId, ethRpcUrl } = getBabylonConfigState();
  return {
    ...STATIC_CONFIG[ethChainId],
    rpcUrl: ethRpcUrl,
  };
}

/**
 * Get viem Chain object for the configured network.
 *
 * Patches both `rpcUrls.default` and `rpcUrls.public` so any downstream
 * code that calls bare `http()` or that builds RPC namespace maps from
 * `rpcUrls.public` (e.g. Reown/AppKit internals) routes to the configured
 * RPC instead of viem's bundled public default.
 */
export function getETHChain(): Chain {
  const { ethChainId, ethRpcUrl } = getBabylonConfigState();
  const baseChain = ethChainId === ETH_MAINNET_CHAIN_ID ? mainnet : sepolia;
  return {
    ...baseChain,
    rpcUrls: {
      ...baseChain.rpcUrls,
      default: { http: [ethRpcUrl] },
      public: { http: [ethRpcUrl] },
    },
  };
}
