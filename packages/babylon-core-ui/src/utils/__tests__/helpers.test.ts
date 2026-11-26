import { describe, expect, it } from "vitest";

import { truncateDecimals } from "../helpers";

describe("truncateDecimals", () => {
  it("cuts digits past the limit without losing a unit to float scaling", () => {
    expect(truncateDecimals(0.0002499, 6)).toBe(0.000249);
    // Math.floor(0.000249 * 1e6) / 1e6 === 0.000248
    expect(truncateDecimals(0.000249, 6)).toBe(0.000249);
  });
});
