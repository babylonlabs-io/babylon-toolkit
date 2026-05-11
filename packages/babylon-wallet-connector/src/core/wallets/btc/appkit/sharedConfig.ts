import type { BitcoinAdapter } from "@reown/appkit-adapter-bitcoin";
import type { createAppKit } from "@reown/appkit/react";

/**
 * Shared Bitcoin AppKit config singleton
 *
 * This allows the AppKitBTCProvider (class-based) to access the AppKit modal
 * and Bitcoin adapter that's provided by the application-level initialization.
 *
 * Usage:
 * 1. Application sets the config: setSharedBtcAppKitConfig({ modal, adapter, network })
 * 2. AppKitBTCProvider uses: getSharedBtcAppKitConfig()
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
  modal: ReturnType<typeof createAppKit>;
  adapter: BitcoinAdapter;
  network: "mainnet" | "signet";
  connectionEvents: EventTarget;
}

let sharedBtcAppKitConfig: SharedBtcAppKitConfig | null = null;

export function setSharedBtcAppKitConfig(config: SharedBtcAppKitConfigInput): void {
  sharedBtcAppKitConfig = {
    modal: config.modal,
    adapter: config.adapter,
    network: config.network,
    // Preserve the existing bus across repeated setter calls (e.g. HMR,
    // network switch, re-init). Replacing it would strand any
    // `AppKitBTCProvider` already listening on the prior `EventTarget`
    // while the bridge dispatches on the new one — account-change events
    // would silently stop propagating. An explicit caller override still
    // wins for tests that need a deterministic instance.
    connectionEvents:
      config.connectionEvents ?? sharedBtcAppKitConfig?.connectionEvents ?? new EventTarget(),
  };
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

/**
 * Test-only helper that wipes the singleton between tests. Not part of
 * the public API surface.
 *
 * @internal
 */
export function __resetSharedBtcAppKitConfigForTests(): void {
  sharedBtcAppKitConfig = null;
}
