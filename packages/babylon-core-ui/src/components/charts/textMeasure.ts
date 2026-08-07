/**
 * Canvas-based text measurement for SVG marks. SVG has no
 * `text-overflow: ellipsis`, so band/legend labels are truncated to their
 * measured width instead (with a clipPath as the hard backstop). In SSR/jsdom
 * there is no canvas 2D context; measurement returns 0 there, which reads as
 * "fits", so text is never truncated in non-browser renders.
 */

const ELLIPSIS = "…";

/** Matches the chart font stack in CSS; a mismatch would drift every width. */
export function chartFont(fontSizePx: number): string {
  return `${fontSizePx}px "Px Grotesk", sans-serif`;
}

/** Axis labels and pills carry `letter-spacing: 0.4px` in the CSS. */
export const AXIS_LETTER_SPACING_PX = 0.4;

/** Measurement cache; cleared wholesale when it grows past this. */
const CACHE_LIMIT = 2048;
const cache = new Map<string, number>();

// Widths measured before "Px Grotesk" finishes loading come from the fallback
// font. Font loads bump an epoch and clear the cache; charts subscribe (via
// useSyncExternalStore in useChartLayout) so they re-measure and re-render
// with true widths instead of keeping the stale ones forever.
let fontEpoch = 0;
let fontListenerAttached = false;
const fontEpochListeners = new Set<() => void>();

export function getFontEpoch(): number {
  return fontEpoch;
}

export function subscribeFontEpoch(listener: () => void): () => void {
  if (!fontListenerAttached && typeof document !== "undefined" && "fonts" in document) {
    fontListenerAttached = true;
    document.fonts.addEventListener("loadingdone", () => {
      cache.clear();
      fontEpoch += 1;
      for (const notify of fontEpochListeners) notify();
    });
  }
  fontEpochListeners.add(listener);
  return () => {
    fontEpochListeners.delete(listener);
  };
}

let ctx: CanvasRenderingContext2D | null | undefined;

function context(): CanvasRenderingContext2D | null {
  if (ctx === undefined) {
    try {
      ctx = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
    } catch {
      // jsdom without a canvas backend throws; treat as "no measurement".
      ctx = null;
    }
  }
  return ctx;
}

/** Rendered width of `text` in px; 0 when no canvas is available (SSR/jsdom).
 * Letter-spacing is added per character, matching the CSS advance model. */
export function measureText(text: string, font: string, letterSpacingPx = 0): number {
  const c = context();
  if (!c) return 0;
  const key = `${font}\u0000${letterSpacingPx}\u0000${text}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  if (cache.size >= CACHE_LIMIT) cache.clear();
  c.font = font;
  const width = c.measureText(text).width + letterSpacingPx * text.length;
  cache.set(key, width);
  return width;
}

/** Longest prefix of `text` (+ ellipsis when shortened) that fits `maxWidth`. */
export function truncateToWidth(text: string, font: string, maxWidth: number, letterSpacingPx = 0): string {
  if (measureText(text, font, letterSpacingPx) <= maxWidth) return text;
  if (maxWidth <= 0) return "";
  let lo = 0;
  let hi = text.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measureText(text.slice(0, mid) + ELLIPSIS, font, letterSpacingPx) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo === 0 ? ELLIPSIS : text.slice(0, lo) + ELLIPSIS;
}
