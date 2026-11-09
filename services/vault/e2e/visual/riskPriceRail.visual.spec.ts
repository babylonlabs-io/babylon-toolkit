import { readFileSync } from "node:fs";

import { expect, test } from "../fixtures";

import {
  assertRecordingCovered,
  capture,
  ensureOutputDir,
  preparePage,
  writeCaptures,
} from "./capture";
import {
  flowScreenshotFileName,
  RISK_PRICE_RAIL_STOPS,
  VISUAL_VIEWPORTS,
} from "./targets";

const HAS_PRICE_DROP_LABEL = readFileSync(
  new URL("../../src/copy.ts", import.meta.url),
  "utf8",
).includes('pctToLiquidationLabel: "BTC Price Drop to Liquidation"');

const IS_BASELINE = process.env.CAPTURE_ROOT?.endsWith("/baseline") === true;
const EXPECT_PRICE_DROP_LABEL = !IS_BASELINE || HAS_PRICE_DROP_LABEL;

test.beforeAll(ensureOutputDir);

for (const theme of ["light", "dark"] as const) {
  for (const viewport of VISUAL_VIEWPORTS) {
    test(`capture the liquidation price drop in ${theme} at ${viewport.name}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      const backend = await preparePage(page);
      await page.addInitScript(
        (value) => localStorage.setItem("theme", value),
        theme,
      );
      await page.goto("/e2e/fixtures/riskPriceRail.html", {
        waitUntil: "domcontentloaded",
      });
      await expect(page.locator("html")).toHaveClass(new RegExp(theme));
      const fixture = page.getByTestId("risk-visual-fixture");
      const rail = fixture.getByRole("img", { name: /^Current Price/ });
      const label = rail.getByText(
        EXPECT_PRICE_DROP_LABEL
          ? "BTC Price Drop to Liquidation"
          : "% to Liquidation",
        { exact: true },
      );
      await expect(rail).toBeVisible();
      await expect(rail.getByTestId("risk-marker-current")).toBeVisible();
      await expect(rail.getByTestId("risk-marker-liquidation")).toBeVisible();
      await expect(label).toBeVisible();
      if (EXPECT_PRICE_DROP_LABEL)
        await expect(label).toBeInViewport({ ratio: 0.999 });
      const shot = await capture(
        page,
        flowScreenshotFileName(RISK_PRICE_RAIL_STOPS[theme], viewport),
        { fullPage: false },
      );
      await expect(label).toBeVisible();
      if (EXPECT_PRICE_DROP_LABEL) {
        await expect(label).toBeInViewport({ ratio: 0.999 });
        expect(
          await label.evaluate((element) => {
            const box = element.getBoundingClientRect();
            return (
              box.height <=
                parseFloat(getComputedStyle(element).lineHeight) + 1 &&
              box.left >= 0 &&
              box.right <= innerWidth
            );
          }),
        ).toBe(true);
      }
      const componentShot = {
        ...shot,
        buffer: await fixture.screenshot({ animations: "disabled" }),
      };
      await expect(label).toBeVisible();
      if (EXPECT_PRICE_DROP_LABEL)
        await expect(label).toBeInViewport({ ratio: 0.999 });
      expect(componentShot.buffer.byteLength).toBeGreaterThan(1000);
      assertRecordingCovered(
        backend,
        `liquidation price drop ${theme} ${viewport.name}`,
        ["eth-rpc", "graphql", "vp-health", "mempool"],
      );
      await writeCaptures([componentShot]);
    });
  }
}
