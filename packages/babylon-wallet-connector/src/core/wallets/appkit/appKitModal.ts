import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import type { AppKitNetwork } from "@reown/appkit/networks";
import { createAppKit } from "@reown/appkit/react";
import { cookieStorage, createStorage } from "wagmi";
import type { Chain } from "viem";

import { setSharedWagmiConfig } from "../eth/appkit/sharedConfig";

/**
 * Unified AppKit Modal Configuration
 *
 * This file provides initialization for the ETH AppKit adapter.
 * It creates a single AppKit modal instance for ETH wallet connections.
 */

/**
 * AppKit configuration for ETH wallet connections
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
}

let appKitModal: ReturnType<typeof createAppKit> | null = null;
let wagmiAdapter: WagmiAdapter | null = null;

/**
 * Get the AppKit modal instance (if initialized)
 * @returns The AppKit modal instance or null if not initialized
 */
export function getAppKitModal() {
  return appKitModal;
}

/**
 * Initialize AppKit modal with ETH support
 * Creates a single AppKit instance with the wagmi adapter
 * This should be called once at the application level
 * @param config - Configuration including required metadata and optional ETH chain
 */
export function initializeAppKitModal(config: AppKitModalConfig) {
  // Don't reinitialize if already initialized
  if (appKitModal) {
    return {
      modal: appKitModal,
      wagmiConfig: wagmiAdapter?.wagmiConfig,
    };
  }

  // Project ID is required for AppKit to work
  if (!config.projectId) {
    return null;
  }

  const projectId = config.projectId;
  const metadata = config.metadata;

  const allNetworks: AppKitNetwork[] = [];
  const adapters: WagmiAdapter[] = [];

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

  // Must have at least one network
  if (allNetworks.length === 0) {
    return null;
  }

  // Create single AppKit modal with all adapters
  appKitModal = createAppKit({
    adapters,
    networks: allNetworks as [AppKitNetwork, ...AppKitNetwork[]],
    projectId,
    metadata,
  });

  return {
    modal: appKitModal,
    wagmiConfig: wagmiAdapter?.wagmiConfig,
  };
}
