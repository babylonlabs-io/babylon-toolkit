import { describe, expect, it } from "vitest";

import { snapToSplitMinimum } from "../snapToSplitMinimum";

const range = {
  splitMinSats: 50_000_000,
  sliderMinSats: 1_000_000,
  sliderMaxSats: 101_000_000,
  currentSats: 10_000_000,
};

describe("snapToSplitMinimum", () => {
  it("snaps a drag inside the band to the split minimum", () => {
    expect(snapToSplitMinimum(50_400_000, range)).toBe(50_000_000);
  });

  it("does not snap a drag just outside the band", () => {
    expect(snapToSplitMinimum(50_500_001, range)).toBe(50_500_001);
  });

  it("does not snap a drag to the slider min end", () => {
    expect(
      snapToSplitMinimum(1_000_000, { ...range, splitMinSats: 1_100_000 }),
    ).toBe(1_000_000);
  });

  it("does not snap a drag to the slider max end", () => {
    expect(
      snapToSplitMinimum(101_000_000, { ...range, splitMinSats: 100_900_000 }),
    ).toBe(101_000_000);
  });

  it("does not snap a 1-sat step", () => {
    expect(
      snapToSplitMinimum(50_000_001, { ...range, currentSats: 50_000_000 }),
    ).toBe(50_000_001);
  });

  it("does not snap when the split minimum is outside the range", () => {
    expect(
      snapToSplitMinimum(100_900_000, { ...range, splitMinSats: 101_100_000 }),
    ).toBe(100_900_000);
  });

  it("does not snap when the split minimum is 0", () => {
    expect(
      snapToSplitMinimum(300_000, {
        ...range,
        splitMinSats: 0,
        sliderMinSats: 0,
      }),
    ).toBe(300_000);
  });
});
