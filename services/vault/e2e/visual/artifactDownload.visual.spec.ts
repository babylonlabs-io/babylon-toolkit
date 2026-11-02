import { expect, test } from "../fixtures";
import {
  ARTIFACT_LEGACY_QUOTA_MESSAGE,
  ARTIFACT_QUOTA_MESSAGE,
  artifactProgress,
  CANCEL_DOWNLOAD_TITLE,
  openArtifactDownload,
} from "../fixtures/artifactDownload";

import {
  assertRecordingCovered,
  capture,
  ensureOutputDir,
  preparePage,
  writeCaptures,
} from "./capture";
import { VISUAL_FIXED_TIME } from "./stabilize";
import {
  ARTIFACT_DOWNLOAD_STOPS,
  ARTIFACT_QUOTA_STOPS,
  flowScreenshotFileName,
  HAS_ARTIFACT_DOWNLOAD_CONFIRMATION,
  VISUAL_VIEWPORTS,
} from "./targets";

test.beforeAll(ensureOutputDir);
test.skip(
  !HAS_ARTIFACT_DOWNLOAD_CONFIRMATION,
  "The merge-base has no cancellation confirmation.",
);

for (const viewport of VISUAL_VIEWPORTS) {
  for (const surface of ["activation", "vault"] as const) {
    test(`capture ${surface} artifact quota error at ${viewport.name}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.clock.install({ time: VISUAL_FIXED_TIME });
      const backend = await preparePage(page);
      await openArtifactDownload(page, surface, "quota");
      const download = page.getByRole("button", {
        name: "Download Artifacts",
        exact: true,
      });
      const quotaError = page
        .getByText(ARTIFACT_QUOTA_MESSAGE, { exact: true })
        .or(page.getByText(ARTIFACT_LEGACY_QUOTA_MESSAGE, { exact: true }));
      await expect(download).toBeEnabled();
      await quotaError.scrollIntoViewIfNeeded();
      // Allow subpixel rounding in wrapped text.
      await expect(quotaError).toBeInViewport({ ratio: 0.999 });
      const shot = await capture(
        page,
        flowScreenshotFileName(ARTIFACT_QUOTA_STOPS[surface], viewport),
        { fullPage: false },
      );
      await download.click();
      await expect(
        page.getByRole("heading", {
          name: "Downloading BTCVault artifacts",
          exact: true,
        }),
      ).toBeVisible();
      await expect(quotaError).not.toBeVisible();
      assertRecordingCovered(backend, `${surface} artifact quota error`, [
        "eth-rpc",
        "graphql",
        "vp-health",
        "mempool",
      ]);
      await writeCaptures([shot]);
    });

    test(`capture ${surface} artifact cancellation at ${viewport.name}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.clock.install({ time: VISUAL_FIXED_TIME });
      const backend = await preparePage(page);
      await openArtifactDownload(page, surface);
      await page
        .getByRole("button", { name: "Cancel download", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: CANCEL_DOWNLOAD_TITLE, exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Keep downloading", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Yes, cancel download", exact: true }),
      ).toBeVisible();
      await expect(artifactProgress(page)).toBeVisible();
      const shot = await capture(
        page,
        flowScreenshotFileName(ARTIFACT_DOWNLOAD_STOPS[surface], viewport),
        { fullPage: false },
      );
      assertRecordingCovered(backend, `${surface} artifact cancellation`, [
        "eth-rpc",
        "graphql",
        "vp-health",
        "mempool",
      ]);
      await writeCaptures([shot]);
    });
  }
}
