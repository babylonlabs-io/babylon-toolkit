import { BitcoinAdapter } from "@reown/appkit-adapter-bitcoin";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { bitcoin, bitcoinSignet } from "@reown/appkit/networks";
import { createAppKit } from "@reown/appkit/react";
import { cookieStorage, createStorage } from "wagmi";
import type { Chain } from "viem";

import { setSharedBtcAppKitConfig } from "../btc/appkit/sharedConfig";
import { setSharedWagmiConfig } from "../eth/appkit/sharedConfig";

/**
 * Unified AppKit Modal Configuration
 *
 * This file provides a unified initialization point for both ETH and BTC AppKit adapters.
 * It creates a single AppKit modal instance that supports both chains.
 */

/**
 * Minimal AppKit configuration
 * Supports ETH-only, BTC-only, or unified ETH+BTC wallet connections
 */
export interface AppKitModalConfig {
  projectId?: string;
  metadata: {
    name: string;
    description: string;
    url: string;
    icons: string[];
  };
  /**
   * ETH configuration (optional)
   * Required only if you want to enable ETH wallet connections
   */
  eth?: {
    /**
     * ETH network chain configuration
     * Provide from your network config (e.g., @babylonlabs-io/config)
     */
    chain: Chain;
  };
  /**
   * BTC configuration (optional)
   * Required only if you want to enable BTC wallet connections
   */
  btc?: {
    /**
     * BTC network (mainnet or signet)
     */
    network: "mainnet" | "signet";
  };
}

let appKitModal: ReturnType<typeof createAppKit> | null = null;
let wagmiAdapter: WagmiAdapter | null = null;
let bitcoinAdapter: BitcoinAdapter | null = null;

/**
 * Get the AppKit modal instance (if initialized)
 * @returns The AppKit modal instance or null if not initialized
 */
export function getAppKitModal() {
  return appKitModal;
}

/**
 * Initialize AppKit modal with ETH and/or BTC support
 * Creates a single AppKit instance with all configured adapters
 * This should be called once at the application level
 * @param config - Configuration including required metadata, optional ETH chain, and optional BTC network
 */
export function initializeAppKitModal(config: AppKitModalConfig) {
  // Don't reinitialize if already initialized
  if (appKitModal) {
    return {
      modal: appKitModal,
      wagmiConfig: wagmiAdapter?.wagmiConfig,
      bitcoinAdapter,
    };
  }

  // Project ID is required for AppKit to work
  if (!config.projectId) {
    return null;
  }

  const projectId = config.projectId;
  const metadata = config.metadata;

  // Build list of all networks for AppKit modal
  const allNetworks: any[] = [];
  const adapters: any[] = [];

  // Create Wagmi Adapter if ETH is configured
  if (config.eth?.chain) {
    const ethNetworks = [config.eth.chain];
    allNetworks.push(...ethNetworks);

    // Create storage for wallet persistence
    const storage = createStorage({
      storage: cookieStorage,
    });

    wagmiAdapter = new WagmiAdapter({
      networks: ethNetworks,
      projectId,
      ssr: false,
      storage,
    });

    adapters.push(wagmiAdapter);

    // Set the shared wagmi config for the wallet-connector AppKitProvider
    setSharedWagmiConfig(wagmiAdapter.wagmiConfig);
  }

  // Create Bitcoin Adapter if BTC is configured
  if (config.btc?.network) {
    const btcNetwork =
      config.btc.network === "mainnet" ? bitcoin : bitcoinSignet;
    allNetworks.push(btcNetwork);

    bitcoinAdapter = new BitcoinAdapter({
      networks: [btcNetwork],
    });

    adapters.push(bitcoinAdapter);
  }

  // Must have at least one network (ETH or BTC)
  if (allNetworks.length === 0) {
    return null;
  }

  // Create single AppKit modal with all adapters
  appKitModal = createAppKit({
    adapters,
    networks: allNetworks as any,
    projectId,
    metadata,
  });

  // Set the shared BTC AppKit config with the actual modal instance
  if (bitcoinAdapter && config.btc?.network) {
    setSharedBtcAppKitConfig({
      modal: appKitModal,
      adapter: bitcoinAdapter,
      network: config.btc.network,
    });
  }

  return {
    modal: appKitModal,
    wagmiConfig: wagmiAdapter?.wagmiConfig,
    bitcoinAdapter,
  };
}
