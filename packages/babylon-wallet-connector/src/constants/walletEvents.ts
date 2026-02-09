/**
 * Wallet event name constants
 *
 * Different wallets use different event names for the same events.
 * These constants help normalize event handling across wallets.
 */

/** Event names for account changes (different wallets use different names) */
export const ACCOUNT_CHANGE_EVENTS = ["accountChanged", "accountsChanged"] as const;

export type AccountChangeEvent = (typeof ACCOUNT_CHANGE_EVENTS)[number];

/** Check if an event name is an account change event */
export function isAccountChangeEvent(eventName: string): eventName is AccountChangeEvent {
  return ACCOUNT_CHANGE_EVENTS.includes(eventName as AccountChangeEvent);
}

/** Event name for disconnect */
export const DISCONNECT_EVENT = "disconnect" as const;

/** Cosmos wallet keystore change events (different wallets use different window events) */
export const COSMOS_KEYSTORE_CHANGE_EVENTS = [
  "keplr_keystorechange",
  "leap_keystorechange",
  "okx_keystorechange",
] as const;

/**
 * Helper to remove event listener from a provider.
 * Falls back from removeListener to off for compatibility across wallet implementations.
 */
export function removeProviderListener(
  provider: { removeListener?: (event: string, cb: () => void) => void; off?: (event: string, cb: () => void) => void },
  event: string,
  callback: () => void,
): void {
  if (typeof provider.removeListener === "function") {
    provider.removeListener(event, callback);
  } else if (typeof provider.off === "function") {
    provider.off(event, callback);
  }
}
