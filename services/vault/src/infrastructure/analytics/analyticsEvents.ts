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
  DEPOSIT_STARTED: "deposit_started",
  VAULT_REGISTERED: "vault_registered",
  DEPOSIT_BROADCAST: "deposit_broadcast",
  VAULT_ACTIVATED: "vault_activated",
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
  /** Coarse BTC band from `amountBucket`, never the exact amount. */
  [ANALYTICS_EVENT.DEPOSIT_STARTED]: {
    amount_bucket: string;
    vault_count: number;
  };
  [ANALYTICS_EVENT.VAULT_REGISTERED]: { vault_id: string };
  [ANALYTICS_EVENT.DEPOSIT_BROADCAST]: { vault_id: string };
  /**
   * Sent only when this session saw the activation add the vault as Aave
   * collateral (the application's `CollateralAdded` log). An activation whose
   * send outcome is unknown, one into another application, and a vault
   * returned at activation are not counted.
   */
  [ANALYTICS_EVENT.VAULT_ACTIVATED]: { vault_id: string };
}
