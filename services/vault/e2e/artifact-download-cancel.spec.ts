import { expect, test } from "@playwright/test";

import {
  artifactClose,
  artifactProgress,
  CANCEL_DOWNLOAD_TITLE,
  openArtifactDownload,
  receivedProgress,
} from "./fixtures/artifactDownload";
import { installRecordedBackend } from "./fixtures/replay";
import { blockOffsiteRequests } from "./visual/capture";

for (const viewport of [
  { name: "desktop", width: 1280, height: 800 },
  { name: "phone", width: 390, height: 844 },
]) {
  for (const surface of ["activation", "vault"] as const) {
    test.describe(`${surface} artifact cancellation at ${viewport.name}`, () => {
      test.beforeEach(async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.clock.install();
        await blockOffsiteRequests(page);
        await installRecordedBackend(page);
      });

      test("keeps the transfer until cancellation is confirmed", async ({
        page,
      }) => {
        let downloads = 0;
        page.on("download", () => downloads++);
        await openArtifactDownload(page, surface);
        const confirmation = page.getByRole("heading", {
          name: CANCEL_DOWNLOAD_TITLE,
          exact: true,
        });
        const before = await receivedProgress(page);
        await page.mouse.click(2, 2);
        await page.keyboard.press("Escape");
        await expect(confirmation).toHaveCount(0);
        await page.clock.runFor(500);
        expect(await receivedProgress(page)).toBeGreaterThan(before);

        await expect(artifactClose(page, surface)).toBeVisible();
        await artifactClose(page, surface).click();
        await expect(confirmation).toBeVisible();
        const pending = await receivedProgress(page);
        await page.clock.runFor(500);
        expect(await receivedProgress(page)).toBeGreaterThan(pending);
        const beforeKeep = await receivedProgress(page);
        await page
          .getByRole("button", { name: "Keep downloading", exact: true })
          .click();
        await expect(confirmation).toBeHidden();
        await expect(artifactProgress(page)).toBeVisible();
        await page.clock.runFor(500);
        expect(await receivedProgress(page)).toBeGreaterThan(beforeKeep);

        await page
          .getByRole("button", { name: "Cancel download", exact: true })
          .click();
        await expect(confirmation).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(confirmation).toBeHidden();
        await page
          .getByRole("button", { name: "Cancel download", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Yes, cancel download", exact: true })
          .click();
        await expect(artifactProgress(page)).toBeHidden();
        await expect(
          page.getByRole("button", { name: "Download Artifacts", exact: true }),
        ).toBeVisible();
        await page.clock.runFor(15_000);
        expect(downloads).toBe(0);

        await page
          .getByRole("button", { name: "Download Artifacts", exact: true })
          .click();
        await artifactClose(page, surface).click();
        await page
          .getByRole("button", { name: "Yes, cancel download", exact: true })
          .click();
        await expect(
          page.getByRole("button", { name: "Download Artifacts", exact: true }),
        ).toHaveCount(0);
        await page.clock.runFor(15_000);
        expect(downloads).toBe(0);
      });

      for (const scenario of ["valid", "truncated"]) {
        test(`removes the confirmation when the ${scenario} transfer ends`, async ({
          page,
        }) => {
          await openArtifactDownload(page, surface, scenario);
          await page
            .getByRole("button", { name: "Cancel download", exact: true })
            .click();
          const confirmation = page.getByRole("heading", {
            name: CANCEL_DOWNLOAD_TITLE,
            exact: true,
          });
          await expect(confirmation).toBeVisible();
          const saved =
            scenario === "valid" ? page.waitForEvent("download") : undefined;
          await page.clock.runFor(15_000);
          if (saved) await saved;
          await expect(confirmation).toBeHidden();
          await expect(artifactProgress(page)).toBeHidden();
          await expect(
            page.getByRole("button", {
              name: "Download Artifacts",
              exact: true,
            }),
          ).toBeVisible();
        });
      }
    });
  }
}
