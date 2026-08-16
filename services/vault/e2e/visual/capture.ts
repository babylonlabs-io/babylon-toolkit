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

/**
 * Smallest PNG that can plausibly be a rendered screen. A capture below this
 * never painted, and must fail rather than quietly become the baseline the
 * next run diffs against.
 */
const MIN_CAPTURE_BYTES = 1000;

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
 * Three separate ways a capture can be worthless, each checked by name so the
 * failure says which one happened:
 *
 *  - `error-dialog` - the app could not boot at all, usually a required env
 *    var absent from `MOCK_ENV_VARS` that a developer's `.env` hides locally.
 *    This gate landed with #2248.
 *  - `app-error-state` - the app booted and then failed, which is what an
 *    unanswered contract read looks like from the outside. This is the one
 *    that hid behind #2248's gate: the config dialog was gone, so the check
 *    passed, and the screens were still error cards.
 *  - a backend miss - the app asked the recording something it does not
 *    contain. The screen may look fine and be missing a section, so this is
 *    checked even when nothing above fired.
 */
export async function assertAppRendered(
  page: Page,
  backend: ReplayBackend,
  label: string,
  requiredBoundaries: readonly RecordedBackend[] = [],
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

/** Create the output directory. Call from `test.beforeAll`. */
export async function ensureOutputDir(): Promise<void> {
  await fs.mkdir(VISUAL_OUTPUT_DIR, { recursive: true });
}
