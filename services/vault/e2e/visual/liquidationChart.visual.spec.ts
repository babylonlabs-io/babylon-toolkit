/**
 * Photographs the liquidations chart.
 *
 * The route capture photographs /liquidations disconnected, which is its
 * "connect your wallet" state, and the recorded depositor holds no position,
 * so a connected walk would reach the "no position" state and never the
 * chart. The god-mode cascade simulator is the way in: in simulated mode the
 * page charts the simulated cascade over the recorded price candles without
 * a wallet at all, which is how QA reviews the chart.
 *
 * The simulator publishes its cascade only while the panel is mounted, and
 * clears it the moment the panel unmounts - so the panel cannot simply be
 * hidden before the photograph, as the deposit-progress walk does. It is
 * popped out into its own window instead, the panel's own "nothing over the
 * page" mode. The popup is held open for the walk, is sealed off the network
 * with the page, and is never photographed.
 *
 * Like the other captures this asserts nothing about how the chart looks. It
 * guarantees the chart is reached, drawn from the recorded candles, and
 * photographed identically on both sides of the comparison.
 */

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
  LIQUIDATION_CHART_STOP,
  LIQUIDATION_SMALL_POSITION_STOP,
  LIQUIDATION_SMALL_POSITION_TOOLTIP_STOP,
  VISUAL_VIEWPORTS,
} from "./targets";

/**
 * The god-mode panel's controls, by the accessible names the panel gives them
 * (`src/dev/GodModePanel.tsx`, `src/dev/panels/CascadeSimulator.tsx`).
 */
const PANEL = {
  launcher: "God mode",
  liquidationsTab: "Liquidations",
  simulated: "Simulated",
  popOut: /pop out/i,
} as const;

/**
 * One candle of the chart, by the testid core-ui's Timeline puts on each
 * (`packages/babylon-core-ui/src/components/LiquidationChart/Timeline.tsx`).
 * A candle on screen is the whole claim: the cascade rendered the chart, and
 * the chart drew the recorded price history rather than an empty frame.
 */
const CANDLE_TESTID = "liq-candle";

for (const viewport of VISUAL_VIEWPORTS) {
  test(`capture the liquidations chart at ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });

    const backend = await preparePage(page);
    await page.addInitScript(() => {
      localStorage.setItem("tbv-liquidation-tour-seen", "true");
    });
    await page.goto("/liquidations", { waitUntil: "domcontentloaded" });

    await page
      .getByRole("button", { name: PANEL.launcher, exact: true })
      .click();
    await page.getByRole("button", { name: PANEL.liquidationsTab }).click();
    // The simulator's own defaults describe a position with a cascade to
    // chart; nothing is typed, so the same position is charted on both sides.
    await page.getByRole("button", { name: PANEL.simulated }).click();

    // The popup is awaited alongside the click, not after it: the event fires
    // during the click, and a listener attached later would miss it. The
    // handle is kept for the whole walk, because closing the window drops
    // the panel back onto the page and its unmount clears the cascade.
    const [popup] = await Promise.all([
      page.waitForEvent("popup"),
      page.getByRole("button", { name: PANEL.popOut }).click(),
    ]);
    expect(popup.isClosed()).toBe(false);

    await expect(page.getByTestId(CANDLE_TESTID).first()).toBeVisible();
    const shots = [
      await capture(
        page,
        flowScreenshotFileName(LIQUIDATION_CHART_STOP, viewport),
      ),
    ];

    // Use the amounts, debt and price from #2858. Its CF and bonus are unknown.
    // Use the existing launch case: CF 78%, THF 1.08, LB 1.0504, expected HF 0.99.
    const customSummary = popup
      .locator("summary:visible")
      .filter({ hasText: "Custom…" });
    await customSummary.click();
    const customInputs = customSummary.locator("..");
    for (const [label, value] of [
      ["BTC Price ($)", "1017"],
      ["Total Debt ($)", "103.4"],
      ["CF", "0.78"],
      ["THF", "1.08"],
      ["LB (at expected HF)", "1.0504"],
      ["Expected HF", "0.99"],
      ["Vault 1", "0.12016827"],
      ["Vault 2", "0.01"],
    ] as const) {
      await customInputs
        .getByText(label, { exact: true })
        .locator("..")
        .locator("input")
        .fill(value);
    }
    await expect(
      page.getByRole("textbox", { name: "Enter BTC price" }),
    ).toHaveValue("$1,017");
    await expect(page.getByTestId("liq-band-0")).toBeVisible();
    shots.push(
      await capture(
        page,
        flowScreenshotFileName(LIQUIDATION_SMALL_POSITION_STOP, viewport),
      ),
    );
    await page.getByTestId("liq-band-0").scrollIntoViewIfNeeded();
    await page.getByTestId("liq-band-0").focus();
    await expect(page.locator(".bbn-liq-popover")).toBeInViewport({ ratio: 1 });
    shots.push(
      await capture(
        page,
        flowScreenshotFileName(
          LIQUIDATION_SMALL_POSITION_TOOLTIP_STOP,
          viewport,
        ),
        { fullPage: false },
      ),
    );

    // The candles come from the indexer's recorded answers; the rest of the
    // shell reads what every route reads.
    assertRecordingCovered(backend, `liquidations chart at ${viewport.name}`, [
      "eth-rpc",
      "graphql",
      "vp-health",
      "mempool",
    ]);
    // Capture both sides even when the base shows the reported defect.
    // The page test owns the candidate's vault count and percentage assertions.
    await writeCaptures(shots);
  });
}

test.beforeAll(ensureOutputDir);
