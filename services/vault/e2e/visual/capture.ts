/**
 * The parts of a capture that every visual spec needs and none should
 * re-invent: a sealed network, a recorded backend behind it, and the gates
 * that decide whether what rendered is worth photographing.
 *
 * The gates are the point. A visual check compares a screen against itself at
 * the merge-base, so a screen that fails IDENTICALLY on both sides reports
 * "no visual changes" - the most confident-looking result the tool can
 * produce, and a lie. Ten of the twelve vault screens were photographs of an
 * error card for exactly that reason. Everything below is written so that
 * outcome is a red build instead.
 */

import type { Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

import { VISUAL_OUTPUT_DIR } from "../../playwright.visual.config";
import { expect } from "../fixtures";
import {
  installRecordedBackend,
  type ReplayBackend,
  type ReplayOptions,
} from "../fixtures/replay";
import type { RecordedBackend } from "../fixtures/replay/recording";

import { installVisualDeterminism, waitForVisualStability } from "./stabilize";
import {
  DEPOSIT_FLOW_STOPS,
  flowScreenshotFileName,
  screenshotFileName,
  VISUAL_TARGETS,
  VISUAL_VIEWPORTS,
} from "./targets";

/**
 * Smallest PNG that can plausibly be a rendered screen. A capture below this
 * never painted, and must fail rather than quietly become the baseline the
 * next run diffs against.
 */
const MIN_CAPTURE_BYTES = 1000;

/**
 * The width at or above which the app must render its desktop tree.
 *
 * The default breakpoint of core-ui's `useIsMobile`
 * (packages/babylon-core-ui/src/hooks/useIsMobile.ts), which is what every
 * responsive branch in the vault shell reads.
 */
const DESKTOP_LAYOUT_MIN_WIDTH_PX = 768;

/**
 * The hamburger button core-ui's Header renders on its mobile branch, and
 * only there.
 *
 * Read rather than added: this is the accessible name core-ui already ships,
 * and the `nav-*` testids next to it are real-wallet E2E hooks this harness
 * must not disturb. It is also the one marker that works on every screen -
 * the sidebar cannot be used, because the disconnected `/` route is the entry
 * layout and legitimately has no sidebar at any width.
 */
const MOBILE_MENU_BUTTON = 'button[aria-label="Open menu"]';

/**
 * Name of the manifest each capture writes beside its PNGs, listing the
 * screens that side INTENDED to produce. Read by `scripts/visual-diff.mjs`
 * (`--expected-baseline` / `--expected-candidate`) and referenced by name in
 * `.github/workflows/visual-regression.yml`; the Storybook capture writes one
 * of its own under the same name. Not a `.png`, so `listPngs` and `copyDir` in
 * the diff script skip it without needing to know it exists.
 */
export const EXPECTED_SCREENS_MANIFEST = "expected-screens.txt";

/**
 * Seal the page off the network.
 *
 * Registered before the recorded backend so the backend's handlers win -
 * Playwright gives precedence to the most recently registered match. What
 * this catches is everything the recording does not cover: it fails closed
 * instead of reaching a live host, which would make a capture vary run to run
 * and, on a fork PR, leak the request.
 */
async function blockOffsiteRequests(page: Page): Promise<void> {
  await page.route("**/*", (route) => {
    const { hostname } = new URL(route.request().url());
    const isLocal = hostname === "localhost" || hostname === "127.0.0.1";
    return isLocal ? route.continue() : route.abort();
  });
}

/**
 * Prepare a page for capture: sealed network, recorded backend, deterministic
 * clock and animations. Call once per test, before the first navigation.
 */
export async function preparePage(
  page: Page,
  replay: ReplayOptions = {},
): Promise<ReplayBackend> {
  await blockOffsiteRequests(page);
  const backend = await installRecordedBackend(page, replay);
  await installVisualDeterminism(page);
  return backend;
}

/**
 * Refuse to photograph an error surface.
 *
 * Two ways a screen can be worthless the moment it is photographed, each
 * checked by name so the failure says which one happened:
 *
 *  - `error-dialog` - the app could not boot at all, usually a required env
 *    var absent from `MOCK_ENV_VARS` that a developer's `.env` hides locally.
 *    This gate landed with #2248.
 *  - `app-error-state` - the app booted and then failed, which is what an
 *    unanswered contract read looks like from the outside. This is the one
 *    that hid behind #2248's gate: the config dialog was gone, so the check
 *    passed, and the screens were still error cards.
 *
 * Both are point-in-time DOM queries, which is why {@link capture} runs them
 * per photograph rather than once at the end of a walk. Checked once at the
 * end, a multi-stop walk verifies every stop against the DOM as it stands at
 * the LAST one: an earlier stop photographed inside a React Query retry window
 * is a static "Something went wrong" frame that `waitForVisualStability`
 * settles on happily, and the retry then succeeds in time for a single
 * trailing check to pass.
 */
export async function assertNoErrorSurface(
  page: Page,
  label: string,
): Promise<void> {
  await expect(
    page.getByTestId("error-dialog"),
    `${label} captured the app's blocking error dialog instead of the page. ` +
      `The app did not boot - fix the capture environment ` +
      `(services/vault/playwright.config.ts) rather than accepting this as a ` +
      `baseline.`,
  ).toHaveCount(0);

  await expect(
    page.getByTestId("app-error-state"),
    `${label} captured the app's error state instead of the page. The app ` +
      `booted and then failed - usually a read the recorded backend cannot ` +
      `answer. Photographing it would bake "Something went wrong" in as the ` +
      `expected look, and it diffs clean against itself forever.`,
  ).toHaveCount(0);
}

/**
 * Refuse to photograph the mobile layout at a desktop width.
 *
 * A category gate, not a fix for one bug. `installVisualDeterminism` freezes
 * `Date.now()` for the life of the page, and that is load-bearing for
 * clock-derived copy - `stabilize.ts` explains why `clock.install()` is not an
 * option instead. The cost is that any throttled or debounced listener in app
 * code is reduced to a single leading-edge call for the whole capture run: it
 * takes whatever the first event carried and never revises it. A resize
 * listener that reads one spurious width therefore keeps it forever.
 *
 * That is exactly what happened. A full-page screenshot of a page taller than
 * the viewport briefly emulates a 1x1 viewport, core-ui's `useIsMobile` took
 * the 1x1 resize on its leading edge, and five 1280px-wide screens were
 * photographed as the mobile tree. `stabilize.ts` no longer fires that event,
 * which closes the instance; this closes the category, because the next
 * listener to arrive will not have that history to warn it.
 *
 * Checked here rather than by the poll for the same reason as
 * {@link assertNoErrorSurface}: the wrong layout is stable, so no amount of
 * waiting can see it. Only a claim about what the frame must CONTAIN can.
 *
 * Below {@link DESKTOP_LAYOUT_MIN_WIDTH_PX} the gate does nothing - the mobile
 * layout is the correct answer there, and the spurious width 1 lands on the
 * same side of the breakpoint as the real one.
 */
async function assertLayoutMatchesViewport(
  page: Page,
  label: string,
): Promise<void> {
  const viewport = page.viewportSize();
  if (!viewport || viewport.width < DESKTOP_LAYOUT_MIN_WIDTH_PX) return;

  await expect(
    page.locator(MOBILE_MENU_BUTTON),
    `${label} captured the mobile layout at a ${viewport.width}px viewport. ` +
      `The app decided it is mobile and never revised that decision, which is ` +
      `what a resize listener does when it takes a spurious width on its ` +
      `leading edge and the frozen capture clock stops its trailing edge from ` +
      `ever firing. The result is a desktop-width photograph of the mobile ` +
      `tree, and it is perfectly static, so it diffs clean against itself ` +
      `forever. Find what resized the page during the capture rather than ` +
      `accepting this as a baseline.`,
  ).toHaveCount(0);
}

/**
 * Assert the recording actually answered what the walk asked of it.
 *
 * The half of the gating that must be DEFERRED to the end, because both
 * checks below accumulate across a walk rather than describing one moment:
 *
 *  - a backend miss - the app asked the recording something it does not
 *    contain. The screen may look fine and be missing a section, so this is
 *    checked even when {@link assertNoErrorSurface} found nothing.
 *  - a boundary that was never reached at all.
 */
export function assertRecordingCovered(
  backend: ReplayBackend,
  label: string,
  requiredBoundaries: readonly RecordedBackend[] = [],
): void {
  // Deduplicated: a polled query re-asks the same unanswered question every
  // few seconds, and a hundred repetitions of one line buries the other two.
  const misses = [...new Set(backend.misses)];
  const unanswered = [
    ...new Set(
      backend.chain.unanswered.map((call) => `${call.target} ${call.selector}`),
    ),
  ];
  expect(
    [...misses, ...unanswered],
    `${label} asked the recorded backend for data it does not hold. The app ` +
      `has gained reads since the recording was captured, so the screen is ` +
      `showing an error or an empty section. Re-record with ` +
      `"pnpm --filter vault run e2e:cli", or add a justified entry to ` +
      `e2e/fixtures/replay/supplements.ts.`,
  ).toEqual([]);

  // Last, and the one that catches what the two above cannot. Both of them
  // only fire for a request that REACHED the backend. Move a boundary out
  // from under the app - a stale URL, a moved port, an env override - and
  // nothing reaches it: no miss is logged, no error state renders, and a
  // screen that needed it falls back to its "nothing to show" variant, which
  // is stable and diffs clean against itself forever.
  //
  // Verified by pointing NEXT_PUBLIC_ETH_RPC_URL at a dead port: every check
  // above stayed green. Only a screen that says which boundaries it depends
  // on can catch that, which is what this argument is for - a total count
  // could not, because the other three boundaries keep answering.
  const silent = requiredBoundaries.filter(
    (boundary) => backend.served[boundary] === 0,
  );
  expect(
    silent,
    `${label} never reached: ${silent.join(", ")}. The app is talking to some ` +
      `other address for those, so this screenshot shows an app missing the ` +
      `data they carry. Check the URLs in playwright.visual.config.ts still ` +
      `match the ones the replay binds to.`,
  ).toEqual([]);
}

/** A photograph taken but not yet written. See {@link writeCaptures}. */
export interface StagedShot {
  readonly fileName: string;
  readonly buffer: Buffer;
}

/**
 * Settle the page and photograph it, WITHOUT writing it to disk.
 *
 * Staged rather than written because the CI capture step is
 * `continue-on-error` (`.github/workflows/visual-regression.yml`), and that is
 * only safe while a fired gate leaves no file behind. A missing surface is
 * what makes the diff step report "missing" and the summary refuse to say "no
 * visual changes"; a screenshot already on disk would hand the diff a
 * complete, comparable set on both sides and let a failed gate report success.
 * So nothing reaches disk until the gates have passed - see
 * {@link writeCaptures}.
 *
 * Full-page rather than viewport-sized: a change below the fold is still a
 * change, and cropping would hide it.
 */
export async function capture(
  page: Page,
  fileName: string,
): Promise<StagedShot> {
  await waitForVisualStability(page);
  // Per photograph, not per walk - see {@link assertNoErrorSurface}. Settled
  // is not the same as rendered: an error fallback is perfectly stable.
  await assertNoErrorSurface(page, fileName);
  // Nor is settled the same as correct: a latched mobile layout is stable too.
  await assertLayoutMatchesViewport(page, fileName);
  const buffer = await page.screenshot({ fullPage: true });
  expect(
    buffer.byteLength,
    `${fileName} is ${buffer.byteLength} bytes - the screen never painted.`,
  ).toBeGreaterThan(MIN_CAPTURE_BYTES);
  return { fileName, buffer };
}

/**
 * Write staged photographs to disk. Call only after {@link assertAppRendered}
 * has passed - reaching here is the test's statement that what it photographed
 * is worth diffing against.
 */
export async function writeCaptures(
  shots: readonly StagedShot[],
): Promise<void> {
  for (const shot of shots) {
    await fs.writeFile(
      path.join(VISUAL_OUTPUT_DIR, shot.fileName),
      shot.buffer,
    );
  }
}

/**
 * Create the output directory and declare which screens it should end up
 * holding. Call from `test.beforeAll`.
 *
 * The manifest is what closes the last silent-green path. A fired gate
 * withholds a PNG, which the diff step is meant to read as "missing" - but it
 * only checks that each surface DIRECTORY is non-empty, and `visual-diff.mjs`
 * builds its name set from the union of the two sides, so a screen absent from
 * BOTH never enters the comparison at all. Both sides run the same stashed
 * harness against the same committed fixture, so every fixture- or
 * harness-caused failure is symmetric BY CONSTRUCTION: the eight deposit-flow
 * shots vanish from both sides, the twelve route shots still land, and the run
 * reports "No visual changes" for a comparison that never looked at 8 of 20
 * screens.
 *
 * Written at collection time rather than derived at diff time on purpose: it
 * is a statement of intent made before anything can fail, so a spec that never
 * ran at all still leaves its screens accounted for.
 */
export async function ensureOutputDir(): Promise<void> {
  await fs.mkdir(VISUAL_OUTPUT_DIR, { recursive: true });

  const expected = [
    ...VISUAL_TARGETS.flatMap((target) =>
      VISUAL_VIEWPORTS.map((viewport) => screenshotFileName(target, viewport)),
    ),
    ...Object.values(DEPOSIT_FLOW_STOPS).flatMap((stop) =>
      VISUAL_VIEWPORTS.map((viewport) =>
        flowScreenshotFileName(stop, viewport),
      ),
    ),
  ].sort();

  // Both specs call this from `test.beforeAll`, and the config pins
  // `workers: 1, fullyParallel: false`, so the two writes are sequential and
  // byte-identical. Declaring the flow stops here even when only the routes
  // spec is collected is the correct direction: it fails loud, not silent.
  await fs.writeFile(
    path.join(VISUAL_OUTPUT_DIR, EXPECTED_SCREENS_MANIFEST),
    `${expected.join("\n")}\n`,
  );
}
