/**
 * Where the Liquidation Analysis tour puts its card next to the section a
 * step spotlights, and how far the page scrolls first to make room for it.
 * Pure functions of measured rectangles.
 */

/** Which side of its target a step's card prefers. */
export type LiquidationTourPlacement = "below" | "above";

/** Height of the tour's own top bar (brand, step label, Exit). */
export const TOUR_BAR_HEIGHT = 72;
/** Space the card keeps from every viewport edge. */
export const VIEWPORT_MARGIN = 16;
/** The card's highest position: under the top bar, one margin below it. */
export const CARD_MIN_TOP = TOUR_BAR_HEIGHT + VIEWPORT_MARGIN;
/** Space the spotlight cutout adds around its target on each side. */
const SPOTLIGHT_PADDING = 8;
/** Space between the target and the card, which holds the arrow. */
const CARD_GAP = 24;
/** Closest the arrow's center comes to either edge of the card. */
export const ARROW_INSET = 24;

interface Size {
  width: number;
  height: number;
}

type TargetRect = Pick<
  DOMRectReadOnly,
  "top" | "bottom" | "left" | "width" | "height"
>;

export interface TourCardLayout {
  /** The cutout in the dimmed backdrop, in viewport coordinates. */
  spotlight: { x: number; y: number; width: number; height: number };
  left: number;
  top: number;
  above: boolean;
  /** The card covers part of the spotlight, so its arrow has nothing to point at. */
  overlapsTarget: boolean;
  /** The arrow's center, from the card's left edge. */
  arrowCenter: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

/** Whether a card fits between its target's bottom edge and the viewport's. */
function fitsBelow(
  targetBottom: number,
  cardHeight: number,
  viewportHeight: number,
): boolean {
  return (
    targetBottom + CARD_GAP + cardHeight <= viewportHeight - VIEWPORT_MARGIN
  );
}

/**
 * How far to scroll the page before a step shows its card. An "above" step
 * scrolls so its target sits one card height under the top bar, unless the
 * target would then start inside the bottom margin; then it scrolls like a
 * "below" step. A "below" step scrolls only when its target starts under the
 * top bar or the card does not fit under it, and then brings the target up to
 * the bar.
 */
export function tourScrollOffset({
  target,
  cardHeight,
  viewportHeight,
  placement,
}: {
  target: TargetRect;
  cardHeight: number;
  viewportHeight: number;
  placement: LiquidationTourPlacement;
}): number {
  const targetTopUnderCard = CARD_MIN_TOP + cardHeight + CARD_GAP;
  if (
    placement === "above" &&
    targetTopUnderCard < viewportHeight - VIEWPORT_MARGIN
  ) {
    return target.top - targetTopUnderCard;
  }
  const fits =
    target.top >= CARD_MIN_TOP &&
    fitsBelow(target.bottom, cardHeight, viewportHeight);
  return fits ? 0 : target.top - (CARD_MIN_TOP + SPOTLIGHT_PADDING);
}

/**
 * Places the card beside its target and inside the viewport. The card goes
 * above when it fits there and the step prefers it, or when it does not fit
 * below.
 */
export function layoutTourCard({
  target,
  card,
  viewport,
  placement,
}: {
  target: TargetRect;
  card: Size;
  viewport: Size;
  placement: LiquidationTourPlacement;
}): TourCardLayout {
  const topAbove = target.top - CARD_GAP - card.height;
  const topBelow = target.bottom + CARD_GAP;
  const above =
    Math.round(topAbove) >= CARD_MIN_TOP &&
    (placement === "above" ||
      !fitsBelow(target.bottom, card.height, viewport.height));
  const targetCenter = target.left + target.width / 2;
  const left = clamp(
    targetCenter - card.width / 2,
    VIEWPORT_MARGIN,
    viewport.width - card.width - VIEWPORT_MARGIN,
  );
  const top = clamp(
    above ? topAbove : topBelow,
    CARD_MIN_TOP,
    viewport.height - card.height - VIEWPORT_MARGIN,
  );
  return {
    spotlight: {
      x: target.left - SPOTLIGHT_PADDING,
      y: target.top - SPOTLIGHT_PADDING,
      width: target.width + SPOTLIGHT_PADDING * 2,
      height: target.height + SPOTLIGHT_PADDING * 2,
    },
    left,
    top,
    above,
    overlapsTarget:
      top < target.bottom + SPOTLIGHT_PADDING &&
      top + card.height > target.top - SPOTLIGHT_PADDING,
    arrowCenter: clamp(
      targetCenter - left,
      ARROW_INSET,
      card.width - ARROW_INSET,
    ),
  };
}
