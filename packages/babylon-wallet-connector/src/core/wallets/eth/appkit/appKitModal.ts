import { BitcoinAdapter } from "@reown/appkit-adapter-bitcoin";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { bitcoin, bitcoinSignet } from "@reown/appkit/networks";
import { createAppKit } from "@reown/appkit/react";
import { cookieStorage, createStorage } from "wagmi";
import type { Chain } from "viem";

import { setSharedBtcAppKitConfig } from "../../btc/appkit/sharedConfig";

import { setSharedWagmiConfig } from "./sharedConfig";

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
   * Optional ETH network chain configuration
   * If not provided, defaults to Ethereum mainnet
   */
  ethChain?: Chain;
}

export interface AppKitBtcConfig {
  network?: "mainnet" | "signet";
  mempoolUrl?: string;
}

let appKitModal: ReturnType<typeof createAppKit> | null = null;
let wagmiAdapter: WagmiAdapter | null = null;
let bitcoinAdapter: BitcoinAdapter | null = null;

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

  // Use metadata directly from config (now required)
  const metadata = config.metadata;

  // Use provided ETH chain or default to mainnet
  // Consuming apps can pass their network config (e.g., from @babylonlabs-io/config)
  const ethChain: Chain = config.ethChain || ({
    id: 1,
    name: "Ethereum",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: ["https://cloudflare-eth.com"] } },
    blockExplorers: { default: { name: "Etherscan", url: "https://etherscan.io" } },
  } as Chain);
  const networks = [ethChain];

  // Add Bitcoin networks if btcConfig is provided
  // Use any[] to avoid type conflicts between different network definitions
  const allNetworks: any[] = [...networks];
  let customBtcNetwork: any;
  if (btcConfig) {
    const baseBtcNetwork = btcConfig.network === "mainnet" ? bitcoin : bitcoinSignet;
    // Override mempool URL if provided
    if (btcConfig.mempoolUrl) {
      customBtcNetwork = {
        ...baseBtcNetwork,
        rpcUrls: {
          ...baseBtcNetwork.rpcUrls,
          default: {
            ...baseBtcNetwork.rpcUrls?.default,
            http: [btcConfig.mempoolUrl],
          },
        },
      };
      allNetworks.push(customBtcNetwork);
    } else {
      allNetworks.push(baseBtcNetwork);
    }
  }

  // Create storage for wallet persistence
  const storage = createStorage({
    storage: cookieStorage,
  });

  // Create Wagmi Adapter with storage for reconnection
  wagmiAdapter = new WagmiAdapter({
    networks: networks as any, // Cast to any - WagmiAdapter handles type conversion internally
    projectId,
    ssr: false,
    storage,
  });

  // Collect all adapters
  const adapters: any[] = [wagmiAdapter];

  // Create Bitcoin Adapter if btcConfig is provided
  if (btcConfig) {
    const btcNetwork = customBtcNetwork || (btcConfig.network === "mainnet" ? bitcoin : bitcoinSignet);
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
