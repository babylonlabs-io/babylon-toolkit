/**
 * The only events the vault app sends to product analytics, and each event's
 * own properties. `trackEvent` takes its properties from this map. Every event
 * also carries the fields `trackEvent.ts` adds (wallet address, network, visit
 * and session ids) and the attribution fields from `attribution.ts`. Which
 * connected address goes out as the wallet address, and when, is decided in
 * `AnalyticsTracker.tsx` and `analyticsSession.ts`. The payload is defined by
 * these five files together, and changing what any of them sends is a privacy
 * change.
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
   * A wallet connection, once per connection. `restored` is false when the
   * user connected in the connect dialog and true when the app restored a
   * saved session. Ethereum counts when the app's session is confirmed. See
   * `walletConnections.ts`.
   */
  [ANALYTICS_EVENT.WALLET_CONNECTED]: {
    chain: WalletChain;
    restored: boolean;
  };
}
