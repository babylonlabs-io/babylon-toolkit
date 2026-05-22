import { describe, expect, it } from "vitest";

import {
  computeConfirmations,
  computeRemainingEstimateMinutes,
} from "../btcConfirmationProgress";

describe("computeConfirmations", () => {
  it("returns 0 for an unconfirmed (mempool) transaction", () => {
    expect(computeConfirmations({ confirmed: false }, 800_000)).toBe(0);
  });

  it("counts the including block as the first confirmation", () => {
    expect(
      computeConfirmations({ confirmed: true, block_height: 800_000 }, 800_000),
    ).toBe(1);
  });

  it("counts the including block plus every block mined on top", () => {
    expect(
      computeConfirmations({ confirmed: true, block_height: 799_995 }, 800_000),
    ).toBe(6);
  });

  it("never returns a negative count when the tip lags the block height", () => {
    expect(
      computeConfirmations({ confirmed: true, block_height: 800_001 }, 800_000),
    ).toBe(0);
  });

  it("throws when a confirmed transaction has no block height", () => {
    expect(() => computeConfirmations({ confirmed: true }, 800_000)).toThrow(
      /block_height/,
    );
  });
});

describe("computeRemainingEstimateMinutes", () => {
  it("estimates the full wait at zero confirmations", () => {
    expect(computeRemainingEstimateMinutes(0, 6)).toBe(60);
  });

  it("estimates the remaining blocks at ten minutes each", () => {
    expect(computeRemainingEstimateMinutes(4, 6)).toBe(20);
  });

  it("returns null once the required depth is reached", () => {
    expect(computeRemainingEstimateMinutes(6, 6)).toBeNull();
  });

  it("returns null when confirmations exceed the required depth", () => {
    expect(computeRemainingEstimateMinutes(8, 6)).toBeNull();
  });
});
