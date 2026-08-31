import type { Config } from "wagmi";

import { getAppKitState, registerManualAppKitConfig } from "@/core/wallets/appkit/state";

const ETHEREUM_CAPABILITY = "Ethereum";
const MISSING_ETHEREUM_SUPPORT_ERROR = "AppKit was initialized without Ethereum support.";
const SHARED_WAGMI_REPLACEMENT_WARNING =
  "Shared wagmi config is being replaced. This might indicate multiple initializations.";

/**
 * Shared wagmi config singleton
 *
 * This allows the AppKitProvider (class-based) to access the wagmi config
 * that's provided by the application-level WagmiProvider.
 *
 * Usage:
 * 1. Application sets the config: setSharedWagmiConfig(wagmiConfig)
 * 2. AppKitProvider uses: getSharedWagmiConfig()
 */

let sharedWagmiConfig: Config | null = null;

export function setSharedWagmiConfig(config: Config): void {
  registerManualAppKitConfig(ETHEREUM_CAPABILITY);

  if (sharedWagmiConfig && sharedWagmiConfig !== config) {
    console.warn(SHARED_WAGMI_REPLACEMENT_WARNING);
  }
  sharedWagmiConfig = config;
}

export function getSharedWagmiConfig(): Config {
  const initializedState = getAppKitState();
  if (initializedState) {
    if (!initializedState.wagmiConfig) {
      throw new Error(MISSING_ETHEREUM_SUPPORT_ERROR);
    }

    return initializedState.wagmiConfig;
  }

  if (!sharedWagmiConfig) {
    throw new Error(
      "Shared wagmi config not initialized. " +
        "Make sure to call setSharedWagmiConfig() in your app before using AppKit.",
    );
  }
  return sharedWagmiConfig;
}

export function hasSharedWagmiConfig(): boolean {
  const initializedState = getAppKitState();
  return initializedState ? initializedState.wagmiConfig !== undefined : sharedWagmiConfig !== null;
}
