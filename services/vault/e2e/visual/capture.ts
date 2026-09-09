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

import { MOCK_ENV_VARS } from "../../playwright.config";
import { VISUAL_OUTPUT_DIR } from "../../playwright.visual.config";
import { expect } from "../fixtures";
import type { PageWalletConfig } from "../fixtures/pageWallets";
import {
  installRecordedBackend,
  type ReplayBackend,
  type ReplayOptions,
} from "../fixtures/replay";
import {
  RECORDED_DEPLOYMENT,
  RECORDED_DEPOSITOR,
} from "../fixtures/replay/contracts";
import type { RecordedBackend } from "../fixtures/replay/recording";

import { installVisualDeterminism, waitForVisualStability } from "./stabilize";
import {
  DEPOSIT_FLOW_STEPS,
  DEPOSIT_FLOW_STOPS,
  DEPOSIT_PROGRESS_STOPS,
  depositProgressStepStop,
  flowScreenshotFileName,
  LIQUIDATION_CHART_STOP,
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
 * The accessible name of the god-mode panel's collapsed launcher
 * (src/dev/GodModePanel.tsx). The capture config turns the panel on so the
 * deposit-progress walk can seed demo deposits through it, and
 * `stabilize.ts` hides this launcher before every photograph.
 */
const GOD_MODE_LAUNCHER_NAME = "God mode";

/**
 * The deposit progress view's step markers, by the accessible label every
 * row carries (`COPY.deposit.a11y.stepActive` and its siblings) - the same
 * seam the real-wallet step machine reads (`e2e/real/actions/stepMachine.ts`).
 * The view's own progress bar carries no role, and every pending row on the
 * page behind a modal has a bar of its own, so "a progress bar is visible"
 * never proved the stepper rendered. A marker does: nothing else renders one.
 */
export const STEP_MARKER = '[aria-label^="Step "]';

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
 * Registered on the CONTEXT, and before the recorded backend: the backend's
 * page-level handlers win, because Playwright gives a page route precedence
 * over a context route. What this catches is everything the recording does
 * not cover: it fails closed instead of reaching a live host, which would
 * make a capture vary run to run and, on a fork PR, leak the request. The
 * context scope is what also seals a window the page opens - the god-mode
 * panel's pop-out - which has no page route of its own.
 */
async function blockOffsiteRequests(page: Page): Promise<void> {
  await page.context().route("**/*", (route) => {
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
 * The injected wallets, presenting the recorded depositor on the recorded
 * chain.
 *
 * One function rather than a literal in each connected walk: the recording
 * only answers for this address, and only on this chain. A wallet presenting
 * anything else connects fine and then renders an empty dashboard - or a
 * "wrong network" banner across every screen - which is a photograph of
 * nothing, and a second copy of these fields is exactly how that drifts in.
 * The chain id is the recording's own, as the hex quantity a wallet reports.
 */
export function recordedPageWallets(): PageWalletConfig {
  return {
    btcAddress: RECORDED_DEPOSITOR.BTC_ADDRESS,
    btcPublicKeyHex: RECORDED_DEPOSITOR.BTC_PUBLIC_KEY,
    ethAddress: RECORDED_DEPOSITOR.ETH_ADDRESS,
    ethChainIdHex: `0x${Number(RECORDED_DEPLOYMENT.ETH_CHAIN_ID).toString(16)}`,
    ethRpcUrl: MOCK_ENV_VARS.NEXT_PUBLIC_ETH_RPC_URL,
  };
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
 * Reject the mobile layout at a desktop width, even when its pixels are stable.
 * Chromium can emit a temporary 1x1 resize during a full-page screenshot.
 * The fixed clock lets a throttled listener keep that size after restoration.
 * Check before and after each screenshot. The capture filter handles only
 * that temporary event; this guard still catches other wrong-layout causes.
 * Mobile viewports correctly retain their mobile layout.
 */
async function assertLayoutMatchesViewport(
  page: Page,
  label: string,
): Promise<void> {
  const viewport = page.viewportSize();
  if (!viewport || viewport.width < DESKTOP_LAYOUT_MIN_WIDTH_PX) return;

  await expect(
    page.locator(MOBILE_MENU_BUTTON),
    `${label} shows the mobile menu at a ${viewport.width}px viewport. ` +
      `Check screenshot resize events and the fixed capture clock.`,
  ).toHaveCount(0);
}

/**
 * Refuse to photograph dev chrome.
 *
 * The god-mode panel is on for the whole capture (see
 * `playwright.visual.config.ts`), and its launcher is a pill fixed in the
 * bottom-right corner of every screen. `stabilize.ts` hides it by its own
 * classes because it carries no testid, and a testid added in `src/` would not
 * exist on the merge-base side anyway. Those classes can move; when they do,
 * the pill lands in every picture on BOTH sides and diffs clean against itself
 * forever. This is what turns that into a red build.
 *
 * Passes when the launcher is absent altogether - a merge-base that predates
 * the panel, or a local run with the flag off - because "not in the
 * photograph" is the whole claim.
 */
async function assertNoDevChrome(page: Page, label: string): Promise<void> {
  await expect(
    page.getByRole("button", { name: GOD_MODE_LAUNCHER_NAME, exact: true }),
    `${label} would photograph the god-mode launcher. The capture turns the ` +
      `panel on so the deposit-progress walk can seed demo deposits, and ` +
      `stabilize.ts hides its launcher by its classes - those classes have ` +
      `changed. Update HIDE_GOD_MODE_LAUNCHER_CSS rather than accepting dev ` +
      `chrome in the corner of every screen.`,
  ).toBeHidden();
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
 * Capture the full page after content and layout guards pass.
 * Stage bytes until the whole walk passes; a failure withholds every image.
 * Keep offscreen pixels and filter temporary 1x1 resizes during capture.
 * Check the restored viewport and layout before staging the image.
 */
export async function capture(
  page: Page,
  fileName: string,
): Promise<StagedShot> {
  await waitForVisualStability(page);
  // Reject stable error screens before each screenshot.
  await assertNoErrorSurface(page, fileName);
  // Nor is settled the same as correct: a latched mobile layout is stable too.
  await assertLayoutMatchesViewport(page, fileName);
  await assertNoDevChrome(page, fileName);
  const viewport = page.viewportSize();
  if (!viewport || viewport.width <= 1 || viewport.height <= 1) {
    throw new Error(`${fileName} needs a known viewport larger than 1x1.`);
  }
  await page.evaluate(() =>
    document.documentElement.setAttribute("data-visual-capture", ""),
  );
  let buffer: Buffer;
  let captureFailed = false;
  try {
    buffer = await page.screenshot({ fullPage: true });
    await expect
      .poll(() =>
        page.evaluate(() => ({
          width: innerWidth,
          height: innerHeight,
        })),
      )
      .toEqual(viewport);
  } catch (error) {
    captureFailed = true;
    throw error;
  } finally {
    await page
      .evaluate(() =>
        document.documentElement.removeAttribute("data-visual-capture"),
      )
      .catch((error) => {
        if (!captureFailed) throw error;
        // eslint-disable-next-line no-console -- Keep the secondary browser failure in the test log.
        console.error("Full-page capture cleanup also failed:", error);
      });
  }
  await assertLayoutMatchesViewport(page, fileName);
  expect(
    buffer.byteLength,
    `${fileName} is ${buffer.byteLength} bytes - the screen never painted.`,
  ).toBeGreaterThan(MIN_CAPTURE_BYTES);
  return { fileName, buffer };
}

/** Write staged images only after the whole walk passes its guards. */
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
 * Declare expected screens before tests run, including walks that may fail.
 * The report uses this manifest to find screens absent from both sides.
 * A screen present on only one side needs separate capture-failure handling.
 * Call from `test.beforeAll`; every spec writes the same target list.
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
    ...[
      ...Object.values(DEPOSIT_PROGRESS_STOPS),
      ...DEPOSIT_FLOW_STEPS.map(depositProgressStepStop),
      LIQUIDATION_CHART_STOP,
    ].flatMap((stop) =>
      VISUAL_VIEWPORTS.map((viewport) =>
        flowScreenshotFileName(stop, viewport),
      ),
    ),
  ].sort();

  // Every spec calls this from `test.beforeAll`, and the config pins
  // `workers: 1, fullyParallel: false`, so the writes are sequential and
  // byte-identical. Declaring the flow stops here even when only the routes
  // spec is collected is the correct direction: it fails loud, not silent.
  await fs.writeFile(
    path.join(VISUAL_OUTPUT_DIR, EXPECTED_SCREENS_MANIFEST),
    `${expected.join("\n")}\n`,
  );
}
