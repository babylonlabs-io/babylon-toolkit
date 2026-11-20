import { expect, test } from "../fixtures";

import {
  assertRecordingCovered,
  capture,
  ensureOutputDir,
  preparePage,
  writeCaptures,
} from "./capture";
import {
  checkedOutCopy,
  flowScreenshotFileName,
  RISK_PRICE_RAIL_STOPS,
  VISUAL_VIEWPORTS,
} from "./targets";

const LIQUIDATION_LABEL = checkedOutCopy("pctToLiquidationLabel", [
  "% to liquidation",
  "BTC Price Drop to Liquidation",
]);
const CURRENT_PRICE_LABEL = checkedOutCopy("currentPriceLabel", [
  "Current price",
  "Current Price",
]);

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
      const rail = fixture.getByRole("img", {
        name: new RegExp(`^${CURRENT_PRICE_LABEL}`),
      });
      const label = rail.getByText(LIQUIDATION_LABEL, { exact: true });
      await expect(rail).toBeVisible();
      await expect(rail.getByTestId("risk-marker-current")).toBeVisible();
      await expect(rail.getByTestId("risk-marker-liquidation")).toBeVisible();
      await expect(label).toBeVisible();
      await expect(label).toBeInViewport({ ratio: 0.999 });
      const shot = await capture(
        page,
        flowScreenshotFileName(RISK_PRICE_RAIL_STOPS[theme], viewport),
        { fullPage: false },
      );
      await expect(label).toBeVisible();
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
      const componentShot = {
        ...shot,
        buffer: await fixture.screenshot({ animations: "disabled" }),
      };
      await expect(label).toBeVisible();
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
