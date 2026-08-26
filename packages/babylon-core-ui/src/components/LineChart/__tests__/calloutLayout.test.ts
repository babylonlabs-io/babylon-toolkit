import { describe, expect, it } from "vitest";
import { layoutCallouts, type CalloutBox } from "../calloutLayout";

const TRACK = 1000;

function box(key: string, anchor: number, width: number, side: "left" | "right" = "right"): CalloutBox {
  return { key, anchor, width, side };
}

describe("layoutCallouts", () => {
  it("leaves well-separated callouts hanging off their preferred side", () => {
    const placed = layoutCallouts([box("a", 100, 120), box("b", 600, 120)], TRACK);
    expect(placed).toEqual([
      { key: "a", left: 100 },
      { key: "b", left: 600 },
    ]);
  });

  it("flips the later callout to the other side of its rule when the two would overlap", () => {
    // The Figma reference geometry: the kink callout takes its rule's right,
    // and the current callout — 19px away and 97 wide — has to go left.
    const placed = layoutCallouts([box("kink", 758, 146), box("current", 739, 97)], TRACK);
    expect(placed[0]).toEqual({ key: "kink", left: 758 });
    expect(placed[1]).toEqual({ key: "current", left: 642 });
  });

  it("keeps both callouts on their preferred side when the gap fits", () => {
    // Same pair, rules 123px apart: the current callout clears the kink rule.
    const placed = layoutCallouts([box("kink", 861, 139), box("current", 738, 107)], TRACK);
    expect(placed[1]).toEqual({ key: "current", left: 738 });
  });

  it("flips a callout that would run off the right edge", () => {
    expect(layoutCallouts([box("a", 950, 200)], TRACK)).toEqual([{ key: "a", left: 750 }]);
  });

  it("honours an explicit left preference", () => {
    expect(layoutCallouts([box("a", 500, 120, "left")], TRACK)).toEqual([{ key: "a", left: 380 }]);
  });

  it("resolves in array order, so the first callout keeps its preferred side", () => {
    const kinkFirst = layoutCallouts([box("kink", 600, 150), box("current", 580, 120)], TRACK);
    const currentFirst = layoutCallouts([box("current", 580, 120), box("kink", 600, 150)], TRACK);
    expect(kinkFirst.find((p) => p.key === "kink")?.left).toBe(600);
    expect(currentFirst.find((p) => p.key === "current")?.left).toBe(580);
    // Whichever comes second is the one that gives ground.
    expect(kinkFirst.find((p) => p.key === "current")?.left).not.toBe(580);
    expect(currentFirst.find((p) => p.key === "kink")?.left).not.toBe(600);
  });

  it("pushes clear of what is already placed when neither side fits", () => {
    const placed = layoutCallouts([box("a", 300, 300), box("b", 310, 300), box("c", 320, 300)], TRACK);
    const lefts = placed.map((p) => p.left);
    expect(new Set(lefts).size).toBe(3);
    for (const p of placed) {
      expect(p.left).toBeGreaterThanOrEqual(0);
      expect(p.left + 300).toBeLessThanOrEqual(TRACK);
    }
  });

  it("keeps a callout wider than the track pinned to the left edge", () => {
    const placed = layoutCallouts([box("a", 500, 1200)], TRACK);
    expect(placed[0].left).toBe(0);
  });

  it("returns nothing for no callouts", () => {
    expect(layoutCallouts([], TRACK)).toEqual([]);
  });
});
