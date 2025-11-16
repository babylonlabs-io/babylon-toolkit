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
 * Only includes required fields for vault usage
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
   * ETH network chain configuration
   * Must be provided by the consuming application (e.g., from @babylonlabs-io/config)
   */
  ethChain: Chain;
}

export interface AppKitBtcConfig {
  network?: "mainnet" | "signet";
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
 * @param config - Configuration including required metadata for app branding
 * @param btcConfig - Optional Bitcoin configuration
 */
export function initializeAppKitModal(config: AppKitModalConfig, btcConfig?: AppKitBtcConfig) {
  // Don't reinitialize if already initialized
  if (appKitModal && wagmiAdapter) {
    return { modal: appKitModal, wagmiConfig: wagmiAdapter.wagmiConfig, bitcoinAdapter };
  }

  // Get project ID from config or environment
  const projectId =
    config.projectId || (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_REOWN_PROJECT_ID : undefined);

  if (!projectId) {
    console.warn(
      "[AppKit] Reown project ID not provided. AppKit ETH wallet will not be available. Set NEXT_PUBLIC_REOWN_PROJECT_ID environment variable",
    );
    return null;
  }

  // Use metadata and ethChain directly from config (both required)
  const metadata = config.metadata;
  const ethNetworks: Chain[] = [config.ethChain];

  // Add Bitcoin networks if btcConfig is provided
  // Use any[] to avoid type conflicts between ETH and BTC network definitions
  const allNetworks: any[] = [...ethNetworks];
  if (btcConfig) {
    const btcNetwork = btcConfig.network === "mainnet" ? bitcoin : bitcoinSignet;
    allNetworks.push(btcNetwork);
  }

  // Create storage for wallet persistence
  const storage = createStorage({
    storage: cookieStorage,
  });

  // Create Wagmi Adapter with storage for reconnection
  wagmiAdapter = new WagmiAdapter({
    networks: ethNetworks,
    projectId,
    ssr: false,
    storage,
  });

  // Collect all adapters
  const adapters: any[] = [wagmiAdapter];

  // Create Bitcoin Adapter if btcConfig is provided
  if (btcConfig) {
    const btcNetwork = btcConfig.network === "mainnet" ? bitcoin : bitcoinSignet;
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

  // Set the shared wagmi config for the wallet-connector AppKitProvider
  // This prevents multiple WalletConnect initializations
  setSharedWagmiConfig(wagmiAdapter.wagmiConfig);

  // Set the shared BTC AppKit config if Bitcoin adapter was created
  if (bitcoinAdapter && btcConfig) {
    setSharedBtcAppKitConfig({
      modal: appKitModal,
      adapter: bitcoinAdapter,
      network: btcConfig.network || "signet",
    });
  }

  return { modal: appKitModal, wagmiConfig: wagmiAdapter.wagmiConfig, bitcoinAdapter };
}
