/**
 * One-axis label declutter. The Timeline stacks price pills (current price +
 * liquidation levels) on the right axis at their exact price; when two land at
 * the same height they overlap and can't be read. This pushes overlapping pills
 * apart in order, keeping the cluster inside the track — their dashed level
 * lines stay at the true price, only the label moves.
 */

export interface DeclutterItem {
  key: string;
  /** Natural centre along the axis, px. */
  center: number;
  /** Rendered extent along the axis, px. */
  height: number;
}

/**
 * Returns key → resolved centre (px), order preserved. `gap` is the minimum
 * space between adjacent labels.
 *
 * ponytail: assumes the labels' total height fits `track`; denser than that and
 * the top clamp lets them re-overlap. Fine for the handful of price pills here —
 * revisit with leader lines / collapsing if a chart ever stacks dozens.
 */
export function declutterCenters(items: DeclutterItem[], track: number, gap = 2): Map<string, number> {
  const out = new Map<string, number>();
  if (items.length === 0) return out;

  const sorted = [...items].sort((a, b) => a.center - b.center);
  const centers = sorted.map((it) => it.center);
  const n = sorted.length;
  const spacing = (i: number) => sorted[i - 1].height / 2 + sorted[i].height / 2 + gap;

  // Forward pass: shove each label below the previous one's bottom edge.
  for (let i = 1; i < n; i++) {
    centers[i] = Math.max(centers[i], centers[i - 1] + spacing(i));
  }

  // Backward pass: pull the stack back inside the bottom edge and cascade up.
  centers[n - 1] = Math.min(centers[n - 1], track - sorted[n - 1].height / 2);
  for (let i = n - 2; i >= 0; i--) {
    centers[i] = Math.min(centers[i], centers[i + 1] - spacing(i + 1));
  }

  // Clamp the top edge (only re-touches when the stack is taller than the track).
  for (let i = 0; i < n; i++) {
    centers[i] = Math.max(sorted[i].height / 2, centers[i]);
    out.set(sorted[i].key, centers[i]);
  }
  return out;
}
