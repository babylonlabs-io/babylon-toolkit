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

  await page.addStyleTag({ content: FREEZE_SPINNER_CSS });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  const deadline = Date.now() + STABILITY_TIMEOUT_MS;
  let previous = await page.screenshot({ fullPage: true });
  let matches = 0;

  while (Date.now() < deadline) {
    await page.waitForTimeout(STABILITY_QUIET_MS);
    const current = await page.screenshot({ fullPage: true });

    if (current.equals(previous)) {
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
