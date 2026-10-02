import { describe, expect, it } from "vitest";

import { toWeeklyCandles } from "../weeklyCandles";

const MS_PER_DAY = 86_400_000;

/** Daily candles from a Monday, so each run of 7 is one calendar week. */
function dailyFrom(startUtc: number, closes: number[]) {
  return closes.map((close, index) => ({
    time: startUtc + index * MS_PER_DAY,
    open: close - 100,
    high: close + 500,
    low: close - 500,
    close,
  }));
}

describe("toWeeklyCandles", () => {
  it("takes the week's first open, last close and the extremes between", () => {
    // 2025-01-06 is a Monday.
    const monday = Date.UTC(2025, 0, 6);
    const [week] = toWeeklyCandles(
      dailyFrom(monday, [100, 140, 90, 120, 110, 130, 125]),
    );

    expect(week.time).toBe(monday);
    expect(week.open).toBe(0);
    expect(week.close).toBe(125);
    expect(week.high).toBe(640);
    expect(week.low).toBe(-410);
  });

  it("starts a new bar on Monday rather than every seventh candle", () => {
    // Starts on a Wednesday, so the first bar holds 5 days and the next 7.
    const wednesday = Date.UTC(2025, 0, 8);
    const weeks = toWeeklyCandles(
      dailyFrom(
        wednesday,
        Array.from({ length: 12 }, (_, i) => 100 + i),
      ),
    );

    expect(weeks).toHaveLength(2);
    expect(weeks[0].time).toBe(Date.UTC(2025, 0, 6));
    expect(weeks[1].time).toBe(Date.UTC(2025, 0, 13));
    // The Sunday close (100 + 4) ends the first bar; Monday opens the second.
    expect(weeks[0].close).toBe(104);
    expect(weeks[1].open).toBe(5);
  });

  it("returns no bars for an empty series", () => {
    expect(toWeeklyCandles([])).toEqual([]);
  });

  it("leaves the source candles untouched", () => {
    const daily = dailyFrom(Date.UTC(2025, 0, 6), [100, 140]);
    toWeeklyCandles(daily);

    expect(daily[0]).toEqual({
      time: Date.UTC(2025, 0, 6),
      open: 0,
      high: 600,
      low: -400,
      close: 100,
    });
  });
});
