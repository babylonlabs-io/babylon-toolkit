/**
 * The only events the vault app sends to product analytics, and each event's
 * own properties. `trackEvent` takes its properties from this map and adds
 * fields of its own to every event. What is sent is defined by the code in this
 * directory and by each call site of `trackEvent`; changing what any of it
 * sends is a privacy change (SECURITY.md, "Product analytics").
 */
export const ANALYTICS_EVENT = {
  PAGEVIEW: "$pageview",
} as const;

export type AnalyticsEventName =
  (typeof ANALYTICS_EVENT)[keyof typeof ANALYTICS_EVENT];

export interface AnalyticsEventProperties {
  /** Route template (`/markets/:reserveId`), never the concrete path or query. */
  [ANALYTICS_EVENT.PAGEVIEW]: { $pathname: string };
}
