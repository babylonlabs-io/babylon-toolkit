/**
 * Photographs every screen in the capture manifest.
 *
 * This spec asserts nothing about how the app *looks* - that judgement
 * belongs to the diff step, which compares this run's output against the
 * same capture taken at the PR's merge-base. All this file guarantees is
 * that each screen renders real content, settles, and is written to disk
 * under a stable filename.
 *
 * Run it twice on the same commit and the two output directories must be
 * byte-identical. If they are not, the fix belongs in `stabilize.ts`, not
 * in a diff threshold.
 *
 * The backend behind these screens is a recorded devnet run, replayed from
 * the fixture in `e2e/fixtures/replay`. Before that, the VP proxy and the
 * contract reads were left unmocked and every page here rendered the app's
 * error boundary instead.
 */

import { test } from "../fixtures";

import {
  assertAppRendered,
  capture,
  ensureOutputDir,
  preparePage,
  writeCaptures,
} from "./capture";
import {
  screenshotFileName,
  VISUAL_TARGETS,
  VISUAL_VIEWPORTS,
} from "./targets";

test.beforeAll(ensureOutputDir);

for (const target of VISUAL_TARGETS) {
  for (const viewport of VISUAL_VIEWPORTS) {
    test(`capture ${target.name} at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });

      const backend = await preparePage(page);
      await page.goto(target.path, { waitUntil: "domcontentloaded" });
      const shot = await capture(page, screenshotFileName(target, viewport));
      await assertAppRendered(page, backend, target.name);
      await writeCaptures([shot]);
    });
  }
}
