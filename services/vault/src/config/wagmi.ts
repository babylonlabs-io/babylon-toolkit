/**
 * Wagmi Configuration for Vault Application
 *
 * This file initializes AppKit modal (which creates wagmi config internally)
 * and exports the wagmi config for use in the application-level WagmiProvider.
 *
 * Since the vault uses AppKit for ETH wallet connections, we let AppKit create
 * the wagmi config to ensure compatibility.
 */

import { getETHChain, getNetworkConfigBTC } from "@babylonlabs-io/config";
import {
  initializeAppKitModal,
  type AppKitModalConfig,
} from "@babylonlabs-io/wallet-connector";

/**
 * Initialize AppKit modal and get the wagmi config it creates
 *
 * This must be called before the app renders to ensure wagmi config is available
 */
function initializeVaultWagmi() {
  const btcConfig = getNetworkConfigBTC();
  const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID;

  if (!projectId) {
    throw new Error(
      "NEXT_PUBLIC_REOWN_PROJECT_ID environment variable is required. " +
        "Please set it in your .env file or environment configuration.",
    );
  }

  const appKitConfig: AppKitModalConfig = {
    projectId,
    metadata: {
      name: "Babylon Vault",
      description: "Babylon Vault - Secure Bitcoin Vault Platform",
      url:
        typeof window !== "undefined"
          ? window.location.origin
          : "https://staking.vault-devnet.babylonlabs.io",
      icons: [
        typeof window !== "undefined"
          ? `${window.location.origin}/favicon.ico`
          : "https://btcstaking.babylonlabs.io/favicon.ico",
      ],
    },
    eth: {
      chain: getETHChain(),
    },
    btc: {
      network: btcConfig.network === "mainnet" ? "mainnet" : "signet",
    },
  };

  const result = initializeAppKitModal(appKitConfig);

  if (!result || !result.wagmiConfig) {
    throw new Error(
      "Failed to initialize AppKit modal or wagmi config not created",
    );
  }

  return result.wagmiConfig;
}

/**
 * Singleton wagmi config instance
 * Created by AppKit initialization at module load time
 *
 * IMPORTANT: This will throw if NEXT_PUBLIC_REOWN_PROJECT_ID is not set.
 * The vault requires AppKit for ETH wallet connections, so this is a required
 * environment variable. Ensure it's configured before starting the application.
 */
export const vaultWagmiConfig = initializeVaultWagmi();
