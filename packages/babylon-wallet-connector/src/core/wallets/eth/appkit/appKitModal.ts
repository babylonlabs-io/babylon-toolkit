import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import type { Config } from "wagmi";
import { mainnet, sepolia } from "wagmi/chains";

import { setSharedWagmiConfig } from "./sharedConfig";

interface AppKitModalConfig {
    projectId?: string;
    metadata?: {
        name?: string;
        description?: string;
        url?: string;
        icons?: string[];
    };
    themeMode?: "light" | "dark";
    themeVariables?: {
        "--w3m-accent"?: string;
    };
    featuredWalletIds?: string[];
    networks?: any[];
}

let appKitModal: ReturnType<typeof createAppKit> | null = null;
let wagmiAdapter: WagmiAdapter | null = null;

/**
 * Initialize AppKit modal and wagmi configuration
 * This should be called once at the application level
 */
export function initializeAppKitModal(config?: AppKitModalConfig) {
    // Don't reinitialize if already initialized
    if (appKitModal && wagmiAdapter) {
        return { modal: appKitModal, wagmiConfig: wagmiAdapter.wagmiConfig };
    }

    // Get project ID from config or environment
    const projectId = config?.projectId ||
        (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_REOWN_PROJECT_ID : undefined) ||
        "e3a2b903ffa3e74e8d1ce1c2a16e4e27";

    // Get metadata URL dynamically
    const getMetadataUrl = () => {
        if (typeof window !== "undefined") {
            return window.location.origin;
        }
        return config?.metadata?.url || "https://btcstaking.babylonlabs.io";
    };

    // AppKit metadata configuration - ensure all required fields
    const metadata = {
        name: config?.metadata?.name || "Babylon Staking",
        description: config?.metadata?.description || "Babylon Staking - Secure Bitcoin Staking Platform",
        url: config?.metadata?.url || getMetadataUrl(),
        icons: config?.metadata?.icons || ["https://btcstaking.babylonlabs.io/favicon.ico"],
    };

    // Define networks for AppKit - use wagmi chain definitions
    // This is crucial for AppKit to properly display wallet options
    const networks = (config?.networks && config.networks.length > 0)
        ? config.networks
        : [mainnet, sepolia];

    wagmiAdapter = new WagmiAdapter({
        networks,
        projectId,
    });

    // Create and store the AppKit modal instance
    appKitModal = createAppKit({
        adapters: [wagmiAdapter],
        networks: networks as [typeof mainnet, ...typeof networks],
        projectId,
        metadata,
        features: {
            analytics: true,
            swaps: false,
            onramp: false,
        },
        themeMode: config?.themeMode || "light",
        themeVariables: config?.themeVariables || {
            "--w3m-accent": "#FF7C2A",
        },
        // Only set featuredWalletIds if explicitly provided in config
        // Otherwise, show all available wallets (MetaMask, OKX, Coinbase, Rainbow, etc.)
        ...(config?.featuredWalletIds ? { featuredWalletIds: config.featuredWalletIds } : {}),
    });

    // Set the shared wagmi config for the wallet-connector AppKitProvider
    // This prevents multiple WalletConnect initializations
    setSharedWagmiConfig(wagmiAdapter.wagmiConfig);

    return { modal: appKitModal, wagmiConfig: wagmiAdapter.wagmiConfig };
}

/**
 * Get the initialized AppKit modal instance
 * Throws if not initialized
 */
export function getAppKitModal() {
    if (!appKitModal) {
        throw new Error(
            "AppKit modal not initialized. Call initializeAppKitModal() first."
        );
    }
    return appKitModal;
}

/**
 * Get the wagmi configuration from the initialized AppKit
 * Throws if not initialized
 */
export function getAppKitWagmiConfig(): Config {
    if (!wagmiAdapter) {
        throw new Error(
            "AppKit wagmi adapter not initialized. Call initializeAppKitModal() first."
        );
    }
    return (wagmiAdapter as any).wagmiConfig;
}

/**
 * Check if AppKit modal has been initialized
 */
export function hasAppKitModal(): boolean {
    return appKitModal !== null && wagmiAdapter !== null;
}

/**
 * Open the AppKit modal programmatically
 */
export function openAppKitModal() {
    const modal = getAppKitModal();
    modal.open();
}

/**
 * Close the AppKit modal programmatically
 */
export function closeAppKitModal() {
    const modal = getAppKitModal();
    modal.close();
}
