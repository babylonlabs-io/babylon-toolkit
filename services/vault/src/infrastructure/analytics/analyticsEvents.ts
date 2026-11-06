/**
 * The only events the vault app sends to product analytics, and each event's
 * own properties. `trackEvent` takes its properties from this map. Every event
 * also carries the fields `trackEvent.ts` adds (wallet address, network, visit
 * and session ids) and the attribution fields from `attribution.ts`, so the
 * payload is defined by these three files together and a new field in any of
 * them is a privacy change.
 */
export const ANALYTICS_EVENT = {
  PAGEVIEW: "$pageview",
  WALLET_CONNECTED: "wallet_connected",
} as const;

export type AnalyticsEventName =
  (typeof ANALYTICS_EVENT)[keyof typeof ANALYTICS_EVENT];

export type WalletChain = "eth" | "btc";

export interface AnalyticsEventProperties {
  /** Route template (`/markets/:reserveId`), never the concrete path or query. */
  [ANALYTICS_EVENT.PAGEVIEW]: { $pathname: string };
  /**
   * A connection the user makes in the connect dialog, once per wallet per
   * page load; never a restored session. Ethereum counts when the session is
   * confirmed.
   */
  [ANALYTICS_EVENT.WALLET_CONNECTED]: { chain: WalletChain };
}
