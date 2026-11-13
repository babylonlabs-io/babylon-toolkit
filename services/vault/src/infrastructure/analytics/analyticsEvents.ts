/**
 * The only events the vault app sends to product analytics, and each event's
 * own properties. `trackEvent` takes its properties from this map and adds
 * fields of its own to every event. What is sent is defined by the code in this
 * directory and by each call site of `trackEvent`; changing what any of it
 * sends is a privacy change (SECURITY.md, "Product analytics").
 */
export const ANALYTICS_EVENT = {
  PAGEVIEW: "$pageview",
  WALLET_CONNECTED: "wallet_connected",
} as const;

export type AnalyticsEventName =
  (typeof ANALYTICS_EVENT)[keyof typeof ANALYTICS_EVENT];

type WalletChain = "eth" | "btc";

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
