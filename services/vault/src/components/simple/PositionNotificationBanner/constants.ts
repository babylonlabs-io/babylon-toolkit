/**
 * Grace window before the live stale-price banner appears. The price queries
 * poll faster while unhealthy or failing, so a transient blip clears well
 * within this window and never surfaces the banner; a genuinely stale on-chain
 * feed, or a price read that keeps failing, surfaces it after the delay.
 * Notifications stay hidden meanwhile — no stale price is ever fed into the
 * calculation.
 */
export const STALE_PRICE_BANNER_GRACE_MS = 60 * 1000;
