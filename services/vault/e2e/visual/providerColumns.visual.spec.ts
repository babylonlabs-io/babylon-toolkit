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
  PROVIDER_COLUMNS_STOP,
  REQUIRE_PROVIDER_COLUMN_GRID,
  VISUAL_VIEWPORTS,
} from "./targets";

test.beforeAll(ensureOutputDir);

for (const viewport of VISUAL_VIEWPORTS) {
  test(`capture mixed provider columns for the deposit flow at ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const backend = await preparePage(page);
    await page.goto("/e2e/fixtures/providerColumns.html", {
      waitUntil: "domcontentloaded",
    });
    const fixture = page.getByTestId("provider-columns-fixture");
    const rows = fixture.locator("button[aria-pressed]");
    await expect(rows).toHaveCount(2);
    await expect(
      rows.nth(0).getByText("vault-provider-0", { exact: true }),
    ).toBeVisible();
    await expect(rows.nth(1).getByText("Older", { exact: true })).toBeVisible();
    await expect(rows.nth(0).locator("..").getByRole("link")).toHaveCount(0);
    await expect(
      rows.nth(1).locator("..").getByRole("link", {
        name: "View vault provider on explorer",
        exact: true,
      }),
    ).toHaveCount(1);
    const assertColumns = async () => {
      const positions: number[][] = [];
      for (const row of await rows.all()) {
        await expect(row).toBeVisible();
        if (REQUIRE_PROVIDER_COLUMN_GRID)
          await expect(row).toBeInViewport({ ratio: 0.999 });
        const x: number[] = [];
        for (const label of ["Commission", "Active BTC", "Last deposit"]) {
          const metric = row.getByText(label, { exact: true });
          await expect(metric).toBeVisible();
          if (REQUIRE_PROVIDER_COLUMN_GRID)
            await expect(metric).toBeInViewport({ ratio: 0.999 });
          x.push((await metric.boundingBox())!.x);
        }
        positions.push(x);
      }
      if (REQUIRE_PROVIDER_COLUMN_GRID && viewport.width >= 768) {
        for (let column = 0; column < 3; column++) {
          expect(
            Math.abs(positions[0][column] - positions[1][column]),
          ).toBeLessThanOrEqual(1);
        }
      }
    };
    await assertColumns();
    const shot = await capture(
      page,
      flowScreenshotFileName(PROVIDER_COLUMNS_STOP, viewport),
      { fullPage: false },
    );
    const componentShot = {
      ...shot,
      buffer: await fixture.screenshot({ animations: "disabled" }),
    };
    await assertColumns();
    expect(componentShot.buffer.byteLength).toBeGreaterThan(1000);
    assertRecordingCovered(backend, `mixed provider columns ${viewport.name}`, [
      "eth-rpc",
      "graphql",
      "vp-health",
      "mempool",
    ]);
    await writeCaptures([componentShot]);
  });
}
