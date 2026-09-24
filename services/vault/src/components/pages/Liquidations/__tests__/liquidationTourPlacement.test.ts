import { describe, expect, it } from "vitest";

import { layoutTourCard, tourScrollOffset } from "../liquidationTourPlacement";

/**
 * The tour's top bar is 72px and the card keeps 16px from each viewport edge,
 * so the card's highest top is 88. The card sits 24px from its target, and
 * the spotlight adds 8px around the target on each side.
 */

describe("layoutTourCard", () => {
  it("centers a below step's card under its target and pads the spotlight", () => {
    expect(
      layoutTourCard({
        target: { top: 200, bottom: 300, left: 400, width: 200, height: 100 },
        card: { width: 360, height: 150 },
        viewport: { width: 1280, height: 800 },
        placement: "below",
      }),
    ).toEqual({
      spotlight: { x: 392, y: 192, width: 216, height: 116 },
      left: 320,
      top: 324,
      above: false,
      overlapsTarget: false,
      arrowCenter: 180,
    });
  });

  it("keeps a below step's card below when it fits on both sides", () => {
    const layout = layoutTourCard({
      target: { top: 400, bottom: 500, left: 400, width: 200, height: 100 },
      card: { width: 360, height: 150 },
      viewport: { width: 1280, height: 800 },
      placement: "below",
    });

    expect(layout.above).toBe(false);
    expect(layout.top).toBe(524);
  });

  it("moves a below step's card above when it does not fit under its target", () => {
    const layout = layoutTourCard({
      target: { top: 500, bottom: 700, left: 400, width: 200, height: 200 },
      card: { width: 360, height: 150 },
      viewport: { width: 1280, height: 800 },
      placement: "below",
    });

    expect(layout.above).toBe(true);
    expect(layout.top).toBe(326);
  });

  it("puts an above step's card above its target when it fits there", () => {
    const layout = layoutTourCard({
      target: { top: 400, bottom: 500, left: 400, width: 200, height: 100 },
      card: { width: 360, height: 150 },
      viewport: { width: 1280, height: 800 },
      placement: "above",
    });

    expect(layout.above).toBe(true);
    expect(layout.top).toBe(226);
  });

  it("keeps an above step's card below when it would run under the top bar", () => {
    const layout = layoutTourCard({
      target: { top: 150, bottom: 250, left: 400, width: 200, height: 100 },
      card: { width: 360, height: 150 },
      viewport: { width: 1280, height: 800 },
      placement: "above",
    });

    expect(layout.above).toBe(false);
    expect(layout.top).toBe(274);
  });

  it("keeps the card inside the viewport and flags that it covers a tall target", () => {
    const layout = layoutTourCard({
      target: { top: 100, bottom: 700, left: 400, width: 200, height: 600 },
      card: { width: 360, height: 150 },
      viewport: { width: 1280, height: 800 },
      placement: "below",
    });

    expect(layout.top).toBe(634);
    expect(layout.overlapsTarget).toBe(true);
  });

  it("holds the card at the viewport margin and the arrow at its inset near the left edge", () => {
    expect(
      layoutTourCard({
        target: { top: 200, bottom: 300, left: 0, width: 20, height: 100 },
        card: { width: 358, height: 150 },
        viewport: { width: 390, height: 844 },
        placement: "below",
      }),
    ).toMatchObject({ left: 16, arrowCenter: 24 });
  });

  it("holds the card at the viewport margin and the arrow at its inset near the right edge", () => {
    expect(
      layoutTourCard({
        target: { top: 200, bottom: 300, left: 1250, width: 20, height: 100 },
        card: { width: 358, height: 150 },
        viewport: { width: 1280, height: 844 },
        placement: "below",
      }),
    ).toMatchObject({ left: 906, arrowCenter: 334 });
  });
});

describe("tourScrollOffset", () => {
  it("scrolls an above step so its target sits one card height under the top bar", () => {
    expect(
      tourScrollOffset({
        target: { top: 1000, bottom: 1200, left: 0, width: 800, height: 200 },
        cardHeight: 150,
        viewportHeight: 800,
        placement: "above",
      }),
    ).toBe(738);
  });

  it("scrolls an above step like a below step when its target would start inside the bottom margin", () => {
    expect(
      tourScrollOffset({
        target: { top: 1000, bottom: 1200, left: 0, width: 800, height: 200 },
        cardHeight: 236,
        viewportHeight: 360,
        placement: "above",
      }),
    ).toBe(904);
  });

  it("leaves a below step in place when its card fits under the target", () => {
    expect(
      tourScrollOffset({
        target: { top: 200, bottom: 300, left: 0, width: 800, height: 100 },
        cardHeight: 150,
        viewportHeight: 800,
        placement: "below",
      }),
    ).toBe(0);
  });

  it("scrolls a below step up to the top bar when its card does not fit under it", () => {
    expect(
      tourScrollOffset({
        target: { top: 600, bottom: 700, left: 0, width: 800, height: 100 },
        cardHeight: 150,
        viewportHeight: 800,
        placement: "below",
      }),
    ).toBe(504);
  });

  it("scrolls a below step when its card would reach into the bottom margin", () => {
    expect(
      tourScrollOffset({
        target: { top: 400, bottom: 620, left: 0, width: 800, height: 220 },
        cardHeight: 150,
        viewportHeight: 800,
        placement: "below",
      }),
    ).toBe(304);
  });

  it("scrolls a below step down when its target starts under the top bar", () => {
    expect(
      tourScrollOffset({
        target: { top: 50, bottom: 150, left: 0, width: 800, height: 100 },
        cardHeight: 150,
        viewportHeight: 800,
        placement: "below",
      }),
    ).toBe(-46);
  });
});
