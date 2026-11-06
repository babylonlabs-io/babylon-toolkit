/**
 * The only events the vault app sends to product analytics, and each event's
 * own properties. `trackEvent` takes its properties from this map. Every event
 * also carries the fields `trackEvent.ts` adds (network, visit and session
 * ids), so the payload is defined by these two files together and a new field
 * in either is a privacy change.
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
