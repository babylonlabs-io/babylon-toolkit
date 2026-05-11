/**
 * Custom event names used for AppKit BTC wallet communication.
 */

/**
 * Type tag for the connection-changed event the bridge hook
 * (`useAppKitBtcBridge`) dispatches and `AppKitBTCProvider` listens
 * for. The event is delivered on the private `connectionEvents`
 * {@link EventTarget} held inside `SharedBtcAppKitConfig` — NOT on
 * `window`. Dispatching this on `window` would let any same-origin
 * script spoof the connected address/pubkey.
 */
export const APPKIT_BTC_CONNECTED_EVENT = "babylon:appkit-btc-connected";
