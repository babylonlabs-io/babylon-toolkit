import type { Config } from "wagmi";

import { failInitialization, getAppKitState, registerManualAppKitConfig } from "@/core/wallets/appkit/state";

const ETHEREUM_CAPABILITY = "Ethereum";
const SHARED_WAGMI_REPLACEMENT_WARNING =
  "Shared wagmi config is being replaced. This might indicate multiple initializations.";

/**
 * Shared wagmi config singleton
 *
 * This allows the AppKitProvider (class-based) to access the wagmi config
 * that's provided by the application-level WagmiProvider.
 *
 * Use `initializeAppKitModal` for canonical initialization. Use
 * `setSharedWagmiConfig` only when another owner initializes AppKit. Do not
 * combine these modes on the same page. `AppKitProvider` reads either mode
 * through `getSharedWagmiConfig`.
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
      failInitialization("AppKit was initialized without Ethereum support. Initialize it with Ethereum support.", "ETH");
    }

    return initializedState.wagmiConfig;
  }

  if (!sharedWagmiConfig) {
    throw new Error(
      "Shared wagmi config not initialized. " +
        "Initialize AppKit with Ethereum support, or use setSharedWagmiConfig() as an exclusive manual alternative.",
    );
  }
  return sharedWagmiConfig;
}

export function hasSharedWagmiConfig(): boolean {
  const initializedState = getAppKitState();
  return initializedState ? initializedState.wagmiConfig !== undefined : sharedWagmiConfig !== null;
}
