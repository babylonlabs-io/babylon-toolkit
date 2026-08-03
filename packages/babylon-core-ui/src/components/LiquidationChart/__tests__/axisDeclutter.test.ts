import { describe, expect, it } from "vitest";
import { declutterCenters } from "../axisDeclutter";

const TRACK = 300;
const PILL_HEIGHT = 20;

describe("declutterCenters", () => {
  it("leaves labels that do not overlap at their natural centres", () => {
    const out = declutterCenters(
      [
        { key: "a", center: 50, height: PILL_HEIGHT },
        { key: "b", center: 150, height: PILL_HEIGHT },
        { key: "c", center: 250, height: PILL_HEIGHT },
      ],
      TRACK,
    );
    expect(out.get("a")).toBe(50);
    expect(out.get("b")).toBe(150);
    expect(out.get("c")).toBe(250);
  });

  it("pushes overlapping labels apart while preserving their order", () => {
    const out = declutterCenters(
      [
        { key: "a", center: 100, height: PILL_HEIGHT },
        { key: "b", center: 103, height: PILL_HEIGHT },
        { key: "c", center: 106, height: PILL_HEIGHT },
      ],
      TRACK,
    );
    const a = out.get("a") ?? 0;
    const b = out.get("b") ?? 0;
    const c = out.get("c") ?? 0;
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
    // Adjacent centres must be at least a pill height plus the 2px gap apart.
    expect(b - a).toBeGreaterThanOrEqual(PILL_HEIGHT + 2);
    expect(c - b).toBeGreaterThanOrEqual(PILL_HEIGHT + 2);
  });

  it("keeps a cluster near the bottom edge inside the track", () => {
    const out = declutterCenters(
      [
        { key: "a", center: 295, height: PILL_HEIGHT },
        { key: "b", center: 298, height: PILL_HEIGHT },
      ],
      TRACK,
    );
    for (const center of out.values()) {
      expect(center + PILL_HEIGHT / 2).toBeLessThanOrEqual(TRACK);
    }
  });

  it("returns an empty map for no labels", () => {
    expect(declutterCenters([], TRACK).size).toBe(0);
  });

  it("keeps ordering when the stack is taller than the track", () => {
    // Documented degradation: labels re-overlap rather than escape the track
    // top, but their order never inverts.
    const items = Array.from({ length: 20 }, (_, i) => ({
      key: `k${i}`,
      center: 150,
      height: PILL_HEIGHT,
    }));
    const out = declutterCenters(items, TRACK);
    const centers = items.map((it) => out.get(it.key) ?? 0);
    for (let i = 1; i < centers.length; i++) {
      expect(centers[i]).toBeGreaterThanOrEqual(centers[i - 1]);
    }
    expect(Math.max(...centers) + PILL_HEIGHT / 2).toBeLessThanOrEqual(TRACK);
  });
});
