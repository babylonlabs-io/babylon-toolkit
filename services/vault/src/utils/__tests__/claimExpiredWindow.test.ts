import { describe, expect, it } from "vitest";

import { formatClaimWindowRemaining } from "../claimExpiredWindow";

// 300 blocks at the 12s Ethereum slot time is one hour.
const BLOCKS_PER_HOUR = 300;

describe("formatClaimWindowRemaining", () => {
  it("reports whole days, rounded down, for a window of a day or more", () => {
    expect(formatClaimWindowRemaining(216_000)).toBe("~30 days");
    expect(formatClaimWindowRemaining(BLOCKS_PER_HOUR * 47)).toBe("~1 day");
  });

  it("reports whole hours, rounded down, for a window under a day", () => {
    expect(formatClaimWindowRemaining(BLOCKS_PER_HOUR * 5 + 299)).toBe("~5h");
  });

  it("says less than an hour instead of rounding to zero", () => {
    expect(formatClaimWindowRemaining(BLOCKS_PER_HOUR - 1)).toBe(
      "less than an hour",
    );
    expect(formatClaimWindowRemaining(0)).toBe("less than an hour");
  });
});
