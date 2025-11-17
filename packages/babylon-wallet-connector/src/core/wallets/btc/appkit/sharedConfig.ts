import type { BitcoinAdapter } from "@reown/appkit-adapter-bitcoin";
import type { createAppKit } from "@reown/appkit/react";

/**
 * Shared Bitcoin AppKit config singleton
 *
 * This allows the AppKitBTCProvider (class-based) to access the AppKit modal
 * and Bitcoin adapter that's provided by the application-level initialization.
 *
 * Usage:
 * 1. Application sets the config: setSharedBtcAppKitConfig({ modal, adapter })
 * 2. AppKitBTCProvider uses: getSharedBtcAppKitConfig()
 */

export interface SharedBtcAppKitConfig {
  modal: ReturnType<typeof createAppKit>;
  adapter: BitcoinAdapter;
  network: "mainnet" | "signet";
}

let sharedBtcAppKitConfig: SharedBtcAppKitConfig | null = null;

export function setSharedBtcAppKitConfig(config: SharedBtcAppKitConfig): void {
  sharedBtcAppKitConfig = config;
}

export function getSharedBtcAppKitConfig(): SharedBtcAppKitConfig {
  if (!sharedBtcAppKitConfig) {
    throw new Error(
      "Shared BTC AppKit config not initialized. " +
        "Make sure to call setSharedBtcAppKitConfig() in your app before using AppKit BTC.",
    );
  }
  return sharedBtcAppKitConfig;
}

export function hasSharedBtcAppKitConfig(): boolean {
  return sharedBtcAppKitConfig !== null;
}
