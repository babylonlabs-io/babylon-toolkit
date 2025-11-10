import { BitcoinAdapter } from "@reown/appkit-adapter-bitcoin";
import { bitcoin, bitcoinSignet, bitcoinTestnet } from "@reown/appkit/networks";
import { createAppKit } from "@reown/appkit/react";

import { setSharedBtcAppKitConfig } from "./sharedConfig";

export interface AppKitBtcModalConfig {
  projectId?: string;
  metadata: {
    name: string;
    description: string;
    url: string;
    icons: string[];
  };
  themeMode?: "light" | "dark";
  themeVariables?: {
    "--w3m-accent"?: string;
  };
  featuredWalletIds?: string[];
  network?: "mainnet" | "signet" | "testnet";
  features?: {
    analytics?: boolean;
    swaps?: boolean;
    onramp?: boolean;
  };
}

let appKitBtcModal: ReturnType<typeof createAppKit> | null = null;
let bitcoinAdapter: BitcoinAdapter | null = null;

/**
 * Initialize AppKit modal for Bitcoin connections
 * This should be called once at the application level
 * @param config - Configuration including required metadata for app branding
 */
export function initializeAppKitBtcModal(config: AppKitBtcModalConfig) {
  // Don't reinitialize if already initialized
  if (appKitBtcModal && bitcoinAdapter) {
    return { modal: appKitBtcModal, adapter: bitcoinAdapter };
  }

  // Get project ID from config or environment
  const projectId =
    config.projectId ||
    (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_REOWN_PROJECT_ID : undefined) ||
    "e3a2b903ffa3e74e8d1ce1c2a16e4e27";

  // Use metadata directly from config (now required)
  const metadata = config.metadata;

  // Determine network based on config (defaults to mainnet)
  const network = config.network || "mainnet";
  const networks = (network === "mainnet" ? [bitcoin] : network === "signet" ? [bitcoinSignet] : [bitcoinTestnet]) as [
    typeof bitcoin,
    ...(typeof bitcoin)[],
  ];

  // Debug logging for network configuration
  console.log("[AppKit BTC] Initializing with network config:", {
    configuredNetwork: network,
    networkNames: networks.map((n) => n.name),
    networkIds: networks.map((n) => n.caipNetworkId),
  });

  // Create Bitcoin Adapter
  bitcoinAdapter = new BitcoinAdapter({
    networks,
  });

  // Create and store the AppKit modal instance for Bitcoin
  appKitBtcModal = createAppKit({
    adapters: [bitcoinAdapter],
    networks,
    projectId,
    metadata,
    features: {
      analytics: config.features?.analytics ?? true,
      swaps: config.features?.swaps ?? false,
      onramp: config.features?.onramp ?? false,
    },
    themeMode: config.themeMode || "light",
    themeVariables: config.themeVariables || {
      "--w3m-accent": "#FF7C2A",
    },
  });

  // Set the shared config for the wallet-connector AppKitBtcProvider
  setSharedBtcAppKitConfig({ modal: appKitBtcModal, adapter: bitcoinAdapter });

  return { modal: appKitBtcModal, adapter: bitcoinAdapter };
}

/**
 * Get the initialized AppKit Bitcoin modal instance
 * Throws if not initialized
 */
export function getAppKitBtcModal() {
  if (!appKitBtcModal) {
    throw new Error("AppKit BTC modal not initialized. Call initializeAppKitBtcModal() first.");
  }
  return appKitBtcModal;
}

/**
 * Get the Bitcoin adapter from the initialized AppKit
 * Throws if not initialized
 */
export function getBitcoinAdapter(): BitcoinAdapter {
  if (!bitcoinAdapter) {
    throw new Error("Bitcoin adapter not initialized. Call initializeAppKitBtcModal() first.");
  }
  return bitcoinAdapter;
}

/**
 * Check if AppKit BTC modal has been initialized
 */
export function hasAppKitBtcModal(): boolean {
  return appKitBtcModal !== null && bitcoinAdapter !== null;
}

/**
 * Open the AppKit BTC modal programmatically
 */
export function openAppKitBtcModal() {
  const modal = getAppKitBtcModal();
  modal.open();
}

/**
 * Close the AppKit BTC modal programmatically
 */
export function closeAppKitBtcModal() {
  const modal = getAppKitBtcModal();
  modal.close();
}
