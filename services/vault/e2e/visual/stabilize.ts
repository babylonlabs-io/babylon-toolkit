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
 * The stability poll photographs the VIEWPORT, never the full page. A
 * full-page screenshot of a page taller than the viewport makes Playwright
 * take Chromium's `captureBeyondViewport` path, and Chromium emulates a
 * 1x1 viewport for a moment while it does. The page gets a real `resize`
 * event with `window.innerWidth === 1`, then a restore ~10-250ms later.
 * Any throttled or debounced resize listener in app code takes the 1x1
 * edge and keeps it: `setFixedTime` above freezes `Date.now()` for the
 * life of the page, lodash.throttle derives its window from `Date.now()`,
 * so the trailing edge never fires and the restore is discarded. That is
 * how core-ui's `useIsMobile` latched to `true` and five desktop routes
 * were photographed as the mobile tree. The wrong layout is then perfectly
 * static, so a pixel poll cannot tell it from a correct one.
 *
 * A viewport screenshot fires no resize event, so the poll stops causing
 * the defect it is meant to detect. It also stops seeing below the fold,
 * which two screens genuinely need, so the poll folds the document size
 * into the signal as well - see {@link readFrameSignature}. The capture
 * itself stays full-page; it is taken once, after the page has settled.
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
 * What one poll iteration compares. Two parts, because neither alone is
 * enough:
 *
 * - `pixels` is the viewport only. It sees everything above the fold and
 *   nothing below it, and it is the half that must not be full-page (see
 *   the header comment).
 * - `documentWidth` / `documentHeight` cover what the crop hides. A list
 *   that grows below the fold, a lazy chunk that lands off-screen and a
 *   collapsing skeleton all move the document box, so growth the pixels
 *   cannot show still reads as "not settled".
 *
 * A change to EITHER part means the screen is still moving.
 */
interface FrameSignature {
  readonly pixels: Buffer;
  readonly documentWidth: number;
  readonly documentHeight: number;
}

/**
 * Read one {@link FrameSignature} from the live page.
 *
 * The document box is measured BEFORE the pixels, and the order is not a
 * style choice. Reading `scrollWidth` forces a synchronous style and
 * layout flush. Ask for it right after a screenshot and the flush lands
 * between that raster and the next one, which moves the antialiasing of a
 * rounded corner by one grey level: the deposit dialog's amount card came
 * out two different ways across 12 runs of the same commit. Measure
 * first, photograph the layout that measurement settled, and every run
 * agrees again.
 */
async function readFrameSignature(page: Page): Promise<FrameSignature> {
  const { documentWidth, documentHeight } = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    documentHeight: document.documentElement.scrollHeight,
  }));
  const pixels = await page.screenshot();
  return { pixels, documentWidth, documentHeight };
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
