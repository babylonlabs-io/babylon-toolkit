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
 * Initialize AppKit modal with wagmi and/or bitcoin adapters
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
    console.debug(
      "[AppKit] Reown project ID not provided. AppKit will not be available. " +
      "Provide projectId in AppKitModalConfig.",
    );
    return null;
  }

  const projectId = config.projectId;

  // Use metadata from config (required)
  const metadata = config.metadata;

  // Prepare ETH networks if eth config is provided
  const ethNetworks: Chain[] | undefined = config.eth?.chain ? [config.eth.chain] : undefined;

  // Build list of all networks for AppKit modal
  const allNetworks: any[] = [];
  if (ethNetworks) {
    allNetworks.push(...ethNetworks);
  }
  if (config.btc?.network) {
    const btcNetwork = config.btc.network === "mainnet" ? bitcoin : bitcoinSignet;
    allNetworks.push(btcNetwork);
  }

  // Must have at least one network (ETH or BTC)
  if (allNetworks.length === 0) {
    console.warn("[AppKit] No networks configured. Provide either eth or btc config.");
    return null;
  }

  // Create Wagmi Adapter only if ETH is configured
  if (ethNetworks) {
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
  }

  // Collect all adapters
  const adapters: any[] = [];
  if (wagmiAdapter) {
    adapters.push(wagmiAdapter);
  }

  // Create Bitcoin Adapter if btc config is provided
  if (config.btc?.network) {
    const btcNetwork = config.btc.network === "mainnet" ? bitcoin : bitcoinSignet;
    bitcoinAdapter = new BitcoinAdapter({
      networks: [btcNetwork],
    });
    adapters.push(bitcoinAdapter);
  }

  // Create and store the AppKit modal instance with all adapters
  // Using AppKit's defaults for all optional settings
  appKitModal = createAppKit({
    adapters,
    networks: allNetworks as any,
    projectId,
    metadata,
  });

  // Set the shared wagmi config for the wallet-connector AppKitProvider (if ETH is configured)
  // This prevents multiple WalletConnect initializations
  if (wagmiAdapter) {
    setSharedWagmiConfig(wagmiAdapter.wagmiConfig);
  }

  // Set the shared BTC AppKit config if Bitcoin adapter was created
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
