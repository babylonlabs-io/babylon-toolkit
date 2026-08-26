import { blocksToDisplayTime, durationTillNow } from "@/ui/common/utils/time";

describe("blocksToDisplayTime", () => {
  beforeEach(() => {
    // Freeze time to ensure consistent test results
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2024-01-01T12:00:00Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should return '-' if block is undefined", () => {
    expect(blocksToDisplayTime(undefined)).toBe("-");
  });

  it("should return '-' if block is 0", () => {
    expect(blocksToDisplayTime(0)).toBe("-");
  });

  it("should show < 1 day for very small durations (e.g., 1 block)", () => {
    expect(blocksToDisplayTime(1)).toBe("< 1 day");
  });

  it("should show < 1 day for 6 blocks (1 hour)", () => {
    expect(blocksToDisplayTime(6)).toBe("< 1 day");
  });

  it("should convert 200 blocks to ~1 day", () => {
    expect(blocksToDisplayTime(200)).toBe("~1 day");
  });

  it("should convert 144 blocks to 1 day", () => {
    // 144 blocks = 24 hours = 1 day
    expect(blocksToDisplayTime(144)).toBe("1 day");
  });

  it("should convert 288 blocks to 2 days", () => {
    // 288 blocks = 48 hours = 2 days
    expect(blocksToDisplayTime(288)).toBe("2 days");
  });

  it("should convert 301 blocks to ~2 days", () => {
    // 301 blocks ≈ 50.17 hours ≈ 2.09 days
    expect(blocksToDisplayTime(301)).toBe("~2 days");
  });

  it("should convert 900 blocks to ~6 days", () => {
    expect(blocksToDisplayTime(900)).toBe("~6 days");
  });

  it("should convert blocks just under 30 days threshold to days", () => {
    // 29 days = 29 * 24 * 6 = 4176 blocks
    expect(blocksToDisplayTime(4176)).toContain("day");
  });

  it("should convert 4320 blocks to ~5 weeks", () => {
    // 4320 blocks = 30 days = exactly at threshold, should be rounded to ~5 weeks
    expect(blocksToDisplayTime(4320)).toBe("~5 weeks");
  });

  it("should convert blocks at 30 days threshold to weeks", () => {
    // 4320 blocks = 30 days = threshold
    expect(blocksToDisplayTime(4320)).toBe("~5 weeks");
  });

  it("should convert blocks slightly over 30 days to weeks", () => {
    // 4321 blocks = 30 days + 10 minutes, should round to ~5 weeks
    expect(blocksToDisplayTime(4321)).toBe("~5 weeks");
  });

  it("should convert 30000 blocks to ~30 weeks", () => {
    expect(blocksToDisplayTime(30000)).toBe("~30 weeks");
  });

  it("should convert 63000 blocks to ~65 weeks", () => {
    expect(blocksToDisplayTime(63000)).toBe("~65 weeks");
  });

  it("should round weeks to nearest 5 weeks", () => {
    // 21600 blocks = 150 days = ~21.4 weeks, should round to ~20 weeks
    expect(blocksToDisplayTime(21600)).toBe("~20 weeks");
  });

  it("should round weeks up to nearest 5 weeks when above midpoint", () => {
    // 25200 blocks = 175 days = ~25 weeks, should round to ~25 weeks
    expect(blocksToDisplayTime(25200)).toBe("~25 weeks");
  });

  it("should round weeks to nearest 5 weeks for values between 5-week intervals", () => {
    // 33000 blocks = 5500 hours = ~229 days
    // With mocked start date 2024-01-01, differenceInWeeks with ceil = 33 weeks
    // Math.round(33 / 5) * 5 = ~35 weeks
    expect(blocksToDisplayTime(33000)).toBe("~35 weeks");
  });

  it("should handle large block values", () => {
    // 100000 blocks = ~694 days = ~99 weeks, should round to ~100 weeks
    expect(blocksToDisplayTime(100000)).toBe("~100 weeks");
  });
});

describe("durationTillNow", () => {
  const currentTime = new Date("2024-01-01T12:00:00Z").getTime();

  it('should return "Ongoing" if time is empty', () => {
    expect(durationTillNow("", currentTime)).toBe("Ongoing");
  });

  it('should return "Ongoing" if time starts with "000"', () => {
    expect(durationTillNow("0000-00-00T00:00:00Z", currentTime)).toBe(
      "Ongoing",
    );
  });

  it("should return the correct duration in days, hours, and minutes", () => {
    const pastTime = new Date("2023-12-31T10:00:00Z").toISOString();
    expect(durationTillNow(pastTime, currentTime)).toBe("1 day 2 hours ago");
  });

  it("should return the correct duration in hours", () => {
    const pastTime = new Date("2024-01-01T10:00:00Z").toISOString();
    expect(durationTillNow(pastTime, currentTime)).toBe("2 hours ago");
  });

  it("should return the correct duration in minutes", () => {
    const pastTime = new Date("2024-01-01T11:50:00Z").toISOString();
    expect(durationTillNow(pastTime, currentTime)).toBe("10 minutes ago");
  });

  it("should return the correct duration in seconds if less than a minute", () => {
    const pastTime = new Date("2024-01-01T11:59:30Z").toISOString();
    expect(durationTillNow(pastTime, currentTime)).toBe("30 seconds ago");
  });

  it('should return "Just now" if the duration is less than a second', () => {
    let pastTime = new Date("2024-01-01T12:00:00Z").toISOString();
    expect(durationTillNow(pastTime, currentTime)).toBe("Just now");

    // test the ms
    pastTime = new Date("2024-01-01T11:59:59.999Z").toISOString();
    expect(durationTillNow(pastTime, currentTime)).toBe("Just now");
  });

  it("should return only days in coarse mode", () => {
    const pastTime = new Date("2023-12-26T05:05:00Z").toISOString();
    expect(durationTillNow(pastTime, currentTime, false)).toBe("6 days ago");
  });

  it("should return hours in coarse mode when under a day", () => {
    const pastTime = new Date("2024-01-01T02:00:00Z").toISOString();
    expect(durationTillNow(pastTime, currentTime, false)).toBe("10 hours ago");
  });

  it("should return minutes in coarse mode when under an hour", () => {
    const pastTime = new Date("2024-01-01T11:15:00Z").toISOString();
    expect(durationTillNow(pastTime, currentTime, false)).toBe(
      "45 minutes ago",
    );
  });
});
