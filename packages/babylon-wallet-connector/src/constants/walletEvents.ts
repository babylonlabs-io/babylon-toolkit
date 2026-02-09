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
