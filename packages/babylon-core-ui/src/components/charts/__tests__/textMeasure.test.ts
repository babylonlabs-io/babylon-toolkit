import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Width per character the stubbed canvas reports. */
const CHAR_WIDTH = 10;

// textMeasure caches its 2D context and measurements at module level, so each
// test re-imports a fresh copy after installing (or removing) the canvas stub.
async function importFresh() {
  vi.resetModules();
  return import("../textMeasure");
}

function stubCanvas() {
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    font: "",
    measureText: (text: string) => ({ width: text.length * CHAR_WIDTH }),
  }) as unknown as typeof HTMLCanvasElement.prototype.getContext;
}

describe("truncateToWidth", () => {
  const originalGetContext = HTMLCanvasElement.prototype.getContext;

  beforeEach(stubCanvas);
  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
  });

  it("returns the text unchanged when it fits", async () => {
    const { truncateToWidth, chartFont } = await importFresh();
    expect(truncateToWidth("0.6 BTC", chartFont(12), 7 * CHAR_WIDTH)).toBe("0.6 BTC");
  });

  it("truncates to the longest prefix plus an ellipsis that fits", async () => {
    const { truncateToWidth, chartFont } = await importFresh();
    // 5 characters fit; "long" (4 chars) + "…" (1 char) is the widest fit.
    expect(truncateToWidth("long label", chartFont(12), 5 * CHAR_WIDTH)).toBe("long…");
  });

  it("returns an empty string when there is no room at all", async () => {
    const { truncateToWidth, chartFont } = await importFresh();
    expect(truncateToWidth("long label", chartFont(12), 0)).toBe("");
    expect(truncateToWidth("long label", chartFont(12), -4)).toBe("");
  });

  it("counts letter-spacing into the measured width", async () => {
    const { measureText, chartFont } = await importFresh();
    const font = chartFont(12);
    expect(measureText("abcd", font)).toBe(4 * CHAR_WIDTH);
    expect(measureText("abcd", font, 0.5)).toBe(4 * CHAR_WIDTH + 4 * 0.5);
  });

  it("never truncates when no canvas is available (SSR/jsdom)", async () => {
    HTMLCanvasElement.prototype.getContext = vi.fn().mockImplementation(() => {
      throw new Error("Not implemented");
    }) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    const { truncateToWidth, measureText, chartFont } = await importFresh();
    expect(measureText("anything", chartFont(12))).toBe(0);
    expect(truncateToWidth("very long text that would not fit", chartFont(12), 10)).toBe(
      "very long text that would not fit",
    );
  });
});
