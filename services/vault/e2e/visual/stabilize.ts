/**
 * Determinism controls for visual capture.
 *
 * A visual diff is only useful if two runs of the *same* commit produce
 * byte-identical PNGs. Everything here exists to remove a specific
 * source of run-to-run variance found in this app:
 *
 * - **Animations / transitions** are neutralised by core-ui's global
 *   `prefers-reduced-motion` reset (`packages/babylon-core-ui/src/index.css`),
 *   which the capture config triggers with `reducedMotion: "reduce"`.
 *   That reset is a `*` + `!important` rule, so it beats every component
 *   rule regardless of source order - no per-component masking needed.
 * - **The loader spinner** is the one documented exception the reset
 *   deliberately keeps running (`.bbn-loader`, see docs/motion-system.md).
 *   A functional spinner is exactly what a screenshot catches mid-frame,
 *   so `FREEZE_SPINNER_CSS` stops it at a fixed angle.
 * - **Clock-derived copy** (relative timestamps, countdowns, expiry) is
 *   pinned with `setFixedTime`. Deliberately NOT `clock.install()`:
 *   full fake timers stall React Query's retry/refetch scheduling and
 *   the app never reaches a settled frame.
 * - **Web fonts** are self-hosted woff2 (`src/globals.css`), so there is
 *   no CDN race - but the first paint can still land before Px-Grotesk
 *   swaps in, so we await `document.fonts.ready`.
 * - **Everything else** (late data, lazy route chunks, layout shift) is
 *   covered by `waitForVisualStability`, which polls until the rendered
 *   frame stops changing rather than guessing a fixed delay.
 *
 * The stability poll scrolls through overlapping viewport captures. This
 * includes pixels below the fold without changing the viewport dimensions.
 * Full-page polling triggers Chromium's temporary 1x1 viewport. With the
 * fixed clock, throttled resize listeners can keep that incorrect size.
 */

import type { Page } from "@playwright/test";

/**
 * Fixed wall-clock for every capture. Any value works as long as it
 * never changes: it only has to be the *same* instant on the baseline
 * side and the candidate side.
 */
export const VISUAL_FIXED_TIME = new Date("2026-01-01T12:00:00.000Z");

/**
 * Stops the functional spinner that the reduced-motion reset keeps
 * running on purpose. Without this every capture lands on a random
 * rotation angle and each screen diffs against itself forever.
 */
const FREEZE_SPINNER_CSS = `
  .bbn-loader,
  .bbn-loader * {
    animation: none !important;
  }
`;

/**
 * Hides the god-mode panel's collapsed launcher.
 *
 * The capture config turns the panel on (`NEXT_PUBLIC_FF_GOD_MODE_PANEL`) so
 * `depositProgress.visual.spec.ts` can seed demo deposits through it, and the
 * panel then renders a "God mode" pill fixed in the bottom-right corner of
 * every screen. It is dev chrome that never ships, so it is hidden rather
 * than photographed. Matched by its own classes (src/dev/GodModePanel.tsx)
 * because the launcher carries no testid, and a testid added in `src/` would
 * not exist on the merge-base side anyway; `capture.ts` asserts the launcher
 * is gone before every shot, so a class change fails loud instead of quietly
 * putting the pill in every picture.
 */
const HIDE_GOD_MODE_LAUNCHER_CSS = `
  button.fixed.bottom-4.right-4.z-\\[9999\\] {
    display: none !important;
  }
`;

/** Overlap captures so fixed headers do not hide the same document pixels. */
const STABILITY_SCROLL_STEP_RATIO = 0.5;

/** How long the frame must stay byte-identical before we trust it. */
const STABILITY_QUIET_MS = 300;
/** Consecutive identical frames required. */
const STABILITY_CONSECUTIVE_MATCHES = 2;
/** Upper bound on waiting for the page to stop changing. */
const STABILITY_TIMEOUT_MS = 15_000;
/** Upper bound on waiting for React to paint its first real frame. */
const RENDER_TIMEOUT_MS = 30_000;
/**
 * Minimum rendered text length that counts as "the app painted".
 * An un-booted page has an empty `#root` (the inlined theme script is
 * script-only and contributes no text), so anything non-trivial here
 * means React committed a real tree.
 */
const MIN_RENDERED_TEXT_LENGTH = 20;

/**
 * Install page-level determinism. Must run *before* the navigation that
 * renders the screen, because the app reads the clock during first
 * render.
 */
export async function installVisualDeterminism(page: Page): Promise<void> {
  await page.clock.setFixedTime(VISUAL_FIXED_TIME);
}

interface FrameSignature {
  readonly pixels: Buffer;
  readonly documentWidth: number;
  readonly documentHeight: number;
}

/** Compare overlapping captures. Restore the scroll position after each poll. */
async function readFrameSignature(page: Page): Promise<FrameSignature> {
  // Read the document size first to settle layout before capture.
  const { documentWidth, documentHeight, viewportWidth, viewportHeight, x, y } =
    await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      x: window.scrollX,
      y: window.scrollY,
    }));
  const frames: Buffer[] = [];
  const maxX = Math.max(0, documentWidth - viewportWidth);
  const maxY = Math.max(0, documentHeight - viewportHeight);
  if (maxX === 0 && maxY === 0) {
    return { pixels: await page.screenshot(), documentWidth, documentHeight };
  }
  const stepX = viewportWidth * STABILITY_SCROLL_STEP_RATIO;
  const stepY = viewportHeight * STABILITY_SCROLL_STEP_RATIO;
  try {
    for (let top = 0; ; top = Math.min(top + stepY, maxY)) {
      for (let left = 0; ; left = Math.min(left + stepX, maxX)) {
        await page.evaluate(
          ([left, top]) => window.scrollTo({ left, top, behavior: "instant" }),
          [left, top],
        );
        frames.push(await page.screenshot());
        if (left === maxX) break;
      }
      if (top === maxY) break;
    }
  } finally {
    await page.evaluate(
      ([left, top]) => window.scrollTo({ left, top, behavior: "instant" }),
      [x, y],
    );
  }
  return { pixels: Buffer.concat(frames), documentWidth, documentHeight };
}

/** True only when both halves of the signal are unchanged. */
function isSameFrame(a: FrameSignature, b: FrameSignature): boolean {
  return (
    a.documentWidth === b.documentWidth &&
    a.documentHeight === b.documentHeight &&
    a.pixels.equals(b.pixels)
  );
}

/**
 * Block until the page stops changing, then return.
 *
 * Polls the actual rendered bytes instead of waiting on `networkidle`
 * (which never fires while React Query polls) or a fixed sleep (which
 * is either flaky or slow). This is the single most important piece of
 * the harness: it converts "the app is still settling" from a
 * false-positive diff into a wait.
 */
export async function waitForVisualStability(page: Page): Promise<void> {
  // MUST come before the stability poll below. An empty page is
  // trivially "stable" - two blank frames in a row match, the loop
  // returns in ~600ms, and every screen silently becomes a blank white
  // baseline that diffs against itself forever. Gate on React having
  // actually painted first.
  await page.waitForFunction(
    (minLength) => {
      const root = document.getElementById("root");
      if (!root) return false;
      const hasBox = root.getBoundingClientRect().height > 0;
      return hasBox && (root.innerText?.trim().length ?? 0) >= minLength;
    },
    MIN_RENDERED_TEXT_LENGTH,
    { timeout: RENDER_TIMEOUT_MS },
  );

  await page.addStyleTag({
    content: FREEZE_SPINNER_CSS + HIDE_GOD_MODE_LAUNCHER_CSS,
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  const deadline = Date.now() + STABILITY_TIMEOUT_MS;
  let previous = await readFrameSignature(page);
  let matches = 0;

  while (Date.now() < deadline) {
    await page.waitForTimeout(STABILITY_QUIET_MS);
    const current = await readFrameSignature(page);

    if (isSameFrame(current, previous)) {
      matches += 1;
      if (matches >= STABILITY_CONSECUTIVE_MATCHES) return;
    } else {
      matches = 0;
    }
    previous = current;
  }

  throw new Error(
    `Page did not reach a stable frame within ${STABILITY_TIMEOUT_MS}ms. ` +
      `Something on this screen animates or refetches indefinitely - freeze it ` +
      `in stabilize.ts rather than accepting a flaky baseline.`,
  );
}
