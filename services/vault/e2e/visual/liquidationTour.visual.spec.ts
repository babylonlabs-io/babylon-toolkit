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
  HAS_LIQUIDATION_TOUR,
  LIQUIDATION_TOUR_STOPS,
  VISUAL_VIEWPORTS,
} from "./targets";

const STEPS = [
  [LIQUIDATION_TOUR_STOPS.position, "Position Overview"],
  [LIQUIDATION_TOUR_STOPS.health, "Monitor Your Health Factor"],
  [LIQUIDATION_TOUR_STOPS.simulation, "Simulate BTC Price Changes"],
  [LIQUIDATION_TOUR_STOPS.events, "Understand Liquidation Events"],
  [LIQUIDATION_TOUR_STOPS.outcomes, "Explore Liquidation Outcomes"],
] as const;

test.beforeAll(ensureOutputDir);

for (const viewport of VISUAL_VIEWPORTS) {
  test(`capture the liquidation tour at ${viewport.name}`, async ({ page }) => {
    test.skip(
      !HAS_LIQUIDATION_TOUR,
      "The checked-out source has no liquidation tour.",
    );
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    const backend = await preparePage(page);
    await page.addInitScript(() => {
      localStorage.removeItem("tbv-liquidation-tour-seen");
    });
    await page.goto("/liquidations", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "God mode", exact: true }).click();
    await page
      .getByRole("button", { name: "Liquidations", exact: true })
      .click();
    // Open the panel in its own window before the welcome blocks the page.
    const [popup] = await Promise.all([
      page.waitForEvent("popup"),
      page.getByRole("button", { name: /pop out/i }).click(),
    ]);
    // Use the existing simulator defaults and recorded price candles.
    await popup.getByRole("button", { name: "Simulated", exact: true }).click();
    await expect(page.getByTestId("liq-candle").first()).toBeVisible();
    const welcome = page.getByRole("dialog", {
      name: "Welcome to Liquidation Analysis",
      exact: true,
    });
    await expect(welcome).toBeVisible();
    const shots = [
      await capture(
        page,
        flowScreenshotFileName(LIQUIDATION_TOUR_STOPS.welcome, viewport),
        { fullPage: false },
      ),
    ];
    await welcome
      .getByRole("button", { name: "Take a tour", exact: true })
      .click();

    for (const [index, [stop, title]] of STEPS.entries()) {
      const dialog = page.getByRole("dialog", { name: title, exact: true });
      await expect(dialog).toBeVisible();
      await expect(
        dialog.getByText(`Step ${index + 1} of 5`, { exact: true }),
      ).toBeVisible();
      await expect(page.getByTestId("liquidation-tour-card")).toBeVisible();
      if (viewport.name === "desktop" && (index === 2 || index === 3)) {
        await expect(
          page.getByTestId("liquidation-tour-card").locator("img"),
        ).toBeVisible();
      }
      shots.push(
        await capture(page, flowScreenshotFileName(stop, viewport), {
          fullPage: false,
        }),
      );
      await dialog.getByRole("button", { name: "Next", exact: true }).click();
    }

    await expect(page.getByTestId("liquidation-tour-overlay")).toHaveCount(0);
    expect(popup.isClosed()).toBe(false);
    assertRecordingCovered(backend, `liquidation tour at ${viewport.name}`, [
      "eth-rpc",
      "graphql",
      "vp-health",
      "mempool",
    ]);
    await writeCaptures(shots);
  });
}
