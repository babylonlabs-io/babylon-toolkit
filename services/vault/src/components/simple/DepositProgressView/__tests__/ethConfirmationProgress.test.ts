import { describe, expect, it } from "vitest";

import { computeRemainingEthEstimateSeconds } from "../ethConfirmationProgress";

describe("computeRemainingEthEstimateSeconds", () => {
  it("estimates 12 seconds per outstanding Ethereum block", () => {
    expect(computeRemainingEthEstimateSeconds(3, 8)).toBe(60);
  });

  it("estimates the full wait when no confirmations have accrued", () => {
    expect(computeRemainingEthEstimateSeconds(0, 8)).toBe(96);
  });

  it("returns null once the required depth is reached", () => {
    // There is no remaining wait to estimate — the panel switches to its
    // finalizing state instead of showing "~0 sec".
    expect(computeRemainingEthEstimateSeconds(8, 8)).toBeNull();
  });

  it("returns null when the depth is exceeded", () => {
    expect(computeRemainingEthEstimateSeconds(11, 8)).toBeNull();
  });
});
