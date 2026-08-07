/**
 * Photographs every screen in the capture manifest.
 *
 * This spec asserts nothing about how the app *looks* - that judgement
 * belongs to the diff step, which compares this run's output against the
 * same capture taken at the PR's merge-base. All this file guarantees is
 * that each screen renders, settles, and is written to disk under a
 * stable filename.
 *
 * Run it twice on the same commit and the two output directories must be
 * byte-identical. If they are not, the fix belongs in `stabilize.ts`, not
 * in a diff threshold.
 */

import type { Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

import { expect, test } from "../fixtures";
import { mockEthRpc, mockGraphql } from "../fixtures/networkRoutes";

import { installVisualDeterminism, waitForVisualStability } from "./stabilize";
import {
  screenshotFileName,
  VISUAL_TARGETS,
  VISUAL_VIEWPORTS,
} from "./targets";

import { VISUAL_OUTPUT_DIR as OUTPUT_DIR } from "../../playwright.visual.config";

/**
 * Nothing may leave the machine during a capture. The mocks below cover
 * the endpoints the app actually calls; this catch-all makes anything we
 * missed fail closed instead of reaching a live host and introducing
 * run-to-run variance (or, on a fork PR, leaking a request).
 *
 * Registered first on purpose - Playwright gives precedence to the most
 * recently registered matching route, so the specific mocks below win.
 */
async function blockOffsiteRequests(page: Page): Promise<void> {
  await page.route("**/*", (route) => {
    const { hostname } = new URL(route.request().url());
    const isLocal = hostname === "localhost" || hostname === "127.0.0.1";
    return isLocal ? route.continue() : route.abort();
  });
}

/**
 * Deliberately NOT `mockVpProxy`. It answers `/vp-health` with an empty
 * snapshot list, which the app treats as "no vault provider exists" and
 * throws on during startup - React never mounts and `#root` stays empty,
 * so every screen would capture as a blank page. Leaving the VP calls to
 * `blockOffsiteRequests` lets the app fall back to its error surface and
 * render the real shell.
 *
 * `mockEthRpc` answers `eth_chainId`; the contract reads it cannot answer
 * fall through to a JSON-RPC error, which the app renders as its
 * "Something went wrong" card. That is the honest unconnected state this
 * harness can reach today - the fully-populated dashboard needs the
 * page-side wallet provider from #1592.
 */
test.beforeEach(async ({ page }) => {
  await blockOffsiteRequests(page);
  await mockGraphql(page, () => ({ data: {} }));
  await mockEthRpc(page);
  await installVisualDeterminism(page);
});

test.beforeAll(async () => {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
});

for (const target of VISUAL_TARGETS) {
  for (const viewport of VISUAL_VIEWPORTS) {
    test(`capture ${target.name} at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });

      await page.goto(target.path, { waitUntil: "domcontentloaded" });
      await waitForVisualStability(page);

      const fileName = screenshotFileName(target, viewport);
      const buffer = await page.screenshot({ fullPage: true });
      await fs.writeFile(path.join(OUTPUT_DIR, fileName), buffer);

      // A zero-byte or absurdly small PNG means the screen never
      // painted; that must fail the capture rather than silently
      // become an "expected" baseline the next run diffs against.
      expect(buffer.byteLength).toBeGreaterThan(1000);
    });
  }
}
