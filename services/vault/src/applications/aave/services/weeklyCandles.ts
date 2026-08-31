/**
 * Weekly OHLC roll-up of the indexer's daily candles.
 *
 * The indexer only buckets by `hour_1 | hour_4 | day_1`, and a year of daily
 * candles across the borrow modal's ~500px plot is under 1.5px per slot — a
 * smear, not a chart. The liquidation preview is locked to a one-year window,
 * so it rolls the daily series up to calendar weeks (~52 bars) client-side.
 */

import type { Candle } from "@babylonlabs-io/core-ui";

const MS_PER_DAY = 86_400_000;

/**
 * UTC midnight on the Monday of `timeMs`'s week. Bucketing by calendar week
 * (rather than chunking the array in sevens) keeps the bars on stable dates
 * when the series gains a candle or has a gap.
 */
function weekStartMs(timeMs: number): number {
  const date = new Date(timeMs);
  const midnight = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );
  // getUTCDay() is Sunday-first (0); shift to Monday-first so a week runs
  // Mon–Sun.
  return midnight - ((date.getUTCDay() + 6) % 7) * MS_PER_DAY;
}

/**
 * Rolls `candles` (oldest first, as `fetchPriceCandles` returns them) into
 * weekly bars: the week's first open, last close, and the extremes between.
 * Each bar is timestamped at its week start.
 */
export function toWeeklyCandles(candles: Candle[]): Candle[] {
  const weeks: Candle[] = [];
  for (const candle of candles) {
    const time = weekStartMs(candle.time);
    const current = weeks[weeks.length - 1];
    if (!current || current.time !== time) {
      weeks.push({ ...candle, time });
      continue;
    }
    current.high = Math.max(current.high, candle.high);
    current.low = Math.min(current.low, candle.low);
    current.close = candle.close;
  }
  return weeks;
}
