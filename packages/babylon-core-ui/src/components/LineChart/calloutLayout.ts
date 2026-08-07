/**
 * Horizontal placement for marker callouts.
 *
 * Each callout hangs off its marker's rule on a preferred side and stays there
 * unless it would leave the plot or cover a callout already placed — then it
 * takes the other side. Resolution follows array order, so the caller decides
 * which callout keeps its preferred side when two compete.
 */

export interface CalloutBox {
  key: string;
  /** The marker rule's pixel x, which the box hangs off. */
  anchor: number;
  width: number;
  side: "left" | "right";
}

export interface PlacedCallout {
  key: string;
  /** Resolved left edge, px from the plot's left. */
  left: number;
}

const DEFAULT_GAP_PX = 6;

function leftEdge(box: CalloutBox, side: "left" | "right"): number {
  return side === "right" ? box.anchor : box.anchor - box.width;
}

function clear(left: number, width: number, placed: PlacedCallout[], widths: Map<string, number>, gap: number) {
  return placed.every((p) => {
    const pWidth = widths.get(p.key) ?? 0;
    return left + width + gap <= p.left || left >= p.left + pWidth + gap;
  });
}

/**
 * Returns one placement per box, in the input order.
 *
 * When neither side fits, the box is pushed clear of everything already placed
 * and clamped into the track — with enough crowded markers that clamp lets
 * boxes re-overlap rather than escape the plot.
 */
export function layoutCallouts(boxes: CalloutBox[], trackWidth: number, gap = DEFAULT_GAP_PX): PlacedCallout[] {
  const placed: PlacedCallout[] = [];
  const widths = new Map<string, number>();

  for (const box of boxes) {
    const other = box.side === "right" ? "left" : "right";
    const fitting = ([box.side, other] as const).find((side) => {
      const left = leftEdge(box, side);
      return left >= 0 && left + box.width <= trackWidth && clear(left, box.width, placed, widths, gap);
    });

    const left = fitting
      ? leftEdge(box, fitting)
      : Math.max(
          0,
          Math.min(
            trackWidth - box.width,
            placed.reduce((rightmost, p) => Math.max(rightmost, p.left + (widths.get(p.key) ?? 0) + gap), 0),
          ),
        );

    widths.set(box.key, box.width);
    placed.push({ key: box.key, left });
  }

  return placed;
}
