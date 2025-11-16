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

  const appKitConfig: AppKitModalConfig = {
    projectId: process.env.NEXT_PUBLIC_REOWN_PROJECT_ID,
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
    ethChain: getETHChain(),
  };

  const result = initializeAppKitModal(appKitConfig, {
    network: btcConfig.network === "mainnet" ? "mainnet" : "signet",
    mempoolUrl: `${btcConfig.mempoolApiUrl}/api`,
  });

  if (!result) {
    throw new Error("Failed to initialize AppKit modal");
  }

  return result.wagmiConfig;
}

/**
 * Singleton wagmi config instance
 * Created by AppKit initialization at module load time
 */
export const vaultWagmiConfig = initializeVaultWagmi();
