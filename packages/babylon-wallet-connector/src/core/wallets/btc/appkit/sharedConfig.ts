import type { BitcoinAdapter } from "@reown/appkit-adapter-bitcoin";
import type { createAppKit } from "@reown/appkit/react";

import {
  __resetManualAppKitConfigForTests,
  failInitialization,
  getAppKitState,
  registerManualAppKitConfig,
} from "@/core/wallets/appkit/state";

const BITCOIN_CAPABILITY = "Bitcoin";

/**
 * Shared Bitcoin AppKit config singleton
 *
 * This allows the AppKitBTCProvider (class-based) to access the AppKit modal
 * and Bitcoin adapter that's provided by the application-level initialization.
 *
 * Use `initializeAppKitModal` for canonical initialization. Use
 * `setSharedBtcAppKitConfig` only when another owner initializes AppKit. Do
 * not combine these modes on the same page. `AppKitBTCProvider` reads either
 * mode through `getSharedBtcAppKitConfig`.
 */

/**
 * Shape callers pass to {@link setSharedBtcAppKitConfig}. `connectionEvents`
 * is internal — callers may omit it and the setter will provision a private
 * {@link EventTarget} for them.
 */
export interface SharedBtcAppKitConfigInput {
  modal: ReturnType<typeof createAppKit>;
  adapter: BitcoinAdapter;
  network: "mainnet" | "signet";
  /**
   * Optional override for the private connection-events bus. Tests can
   * inject a deterministic instance; production callers should leave this
   * unset and let the setter create one.
   */
  connectionEvents?: EventTarget;
}

/**
 * Resolved shape returned from {@link getSharedBtcAppKitConfig}. Always
 * includes {@link SharedBtcAppKitConfig.connectionEvents} — the setter
 * fills it in if the caller omitted one.
 *
 * `connectionEvents` is the in-process bus the bridge hook
 * (`useAppKitBtcBridge`) uses to notify `AppKitBTCProvider` when the
 * AppKit account changes. It deliberately is NOT exposed on `window`:
 * a same-origin attacker (XSS, malicious extension content script) can
 * dispatch arbitrary events on `window`, but cannot reach a private
 * `EventTarget` instance held only by this singleton. This closes the
 * spoof channel that previously let any same-origin script overwrite
 * the cached connected address/pubkey.
 */
export interface SharedBtcAppKitConfig {
  readonly modal: ReturnType<typeof createAppKit>;
  readonly adapter: BitcoinAdapter;
  readonly network: "mainnet" | "signet";
  readonly connectionEvents: EventTarget;
}

let sharedBtcAppKitConfig: SharedBtcAppKitConfig | null = null;

export function setSharedBtcAppKitConfig(config: SharedBtcAppKitConfigInput): void {
  const resolvedConfig = {
    modal: config.modal,
    adapter: config.adapter,
    network: config.network,
    // Preserve the existing bus across repeated setter calls (e.g. HMR,
    // network switch, re-init). Replacing it would strand any
    // `AppKitBTCProvider` already listening on the prior `EventTarget`
    // while the bridge dispatches on the new one — account-change events
    // would silently stop propagating. An explicit caller override still
    // wins for tests that need a deterministic instance.
    connectionEvents: config.connectionEvents ?? sharedBtcAppKitConfig?.connectionEvents ?? new EventTarget(),
  };

  registerManualAppKitConfig(BITCOIN_CAPABILITY);
  sharedBtcAppKitConfig = resolvedConfig;
}

export function getSharedBtcAppKitConfig(): SharedBtcAppKitConfig {
  const initializedState = getAppKitState();
  if (initializedState) {
    if (!initializedState.btcConfig) {
      failInitialization("AppKit was initialized without Bitcoin support. Initialize it with Bitcoin support.", "BTC");
    }

    return initializedState.btcConfig;
  }

  if (!sharedBtcAppKitConfig) {
    throw new Error(
      "Shared BTC AppKit config not initialized. " +
        "Initialize AppKit with Bitcoin support, or use setSharedBtcAppKitConfig() as an exclusive manual alternative.",
    );
  }
  return sharedBtcAppKitConfig;
}

export function hasSharedBtcAppKitConfig(): boolean {
  const initializedState = getAppKitState();
  return initializedState ? initializedState.btcConfig !== undefined : sharedBtcAppKitConfig !== null;
}

/**
 * Test-only helper that resets the manual Bitcoin config and registry entry.
 * It does not reset canonical state or Reown modal. Use module isolation.
 *
 * @internal
 */
export function __resetSharedBtcAppKitConfigForTests(): void {
  sharedBtcAppKitConfig = null;
  __resetManualAppKitConfigForTests(BITCOIN_CAPABILITY);
}
