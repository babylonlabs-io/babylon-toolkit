import { expect, test } from "../fixtures";
import {
  ARTIFACT_LEGACY_QUOTA_MESSAGE,
  ARTIFACT_QUOTA_MESSAGE,
  artifactProgress,
  CANCEL_DOWNLOAD_TITLE,
  openArtifactDownload,
} from "../fixtures/artifactDownload";
import {
  connectInjectedWallets,
  injectPageWallets,
} from "../fixtures/pageWallets";

import {
  assertRecordingCovered,
  capture,
  ensureOutputDir,
  preparePage,
  recordedPageWallets,
  writeCaptures,
} from "./capture";
import { VISUAL_FIXED_TIME } from "./stabilize";
import {
  ACTIVATION_WARNING_STOPS,
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

test.describe("activation risk warning", () => {
  // Use two device pixels per CSS pixel to show tick changes in the report.
  test.use({ deviceScaleFactor: 2 });

  for (const theme of ["light", "dark"] as const) {
    for (const viewport of VISUAL_VIEWPORTS) {
      test(`capture activation risk warning in ${theme} at ${viewport.name}`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        const backend = await preparePage(page);
        await page.addInitScript(
          (value) => localStorage.setItem("theme", value),
          theme,
        );
        await injectPageWallets(page, recordedPageWallets());
        await page.goto(
          "/e2e/fixtures/artifactDownload.html?surface=activation",
        );
        await connectInjectedWallets(page);
        await page.addStyleTag({
          content: ".tsqd-parent-container { display: none !important; }",
        });
        await expect(page.locator(".tsqd-parent-container")).toBeHidden();
        await page.getByTestId("open-artifact-download").click();
        await page
          .getByRole("button", { name: "Continue without", exact: true })
          .click();

        const modal = page.locator(".portal-root");
        const checkbox = modal.getByRole("checkbox");
        const activate = modal.getByTestId("activate-vault-button");
        await expect(page.locator("html")).toHaveClass(new RegExp(theme));
        await expect(
          modal.getByRole("heading", { name: "Are you sure?", exact: true }),
        ).toBeVisible();
        await expect(checkbox).not.toBeChecked();
        await expect(activate).toBeDisabled();
        const unchecked = await capture(
          page,
          flowScreenshotFileName(ACTIVATION_WARNING_STOPS[theme][0], viewport),
          { fullPage: false },
        );
        await expect(checkbox).not.toBeChecked();
        await modal
          .locator("label")
          .filter({ hasText: "I understand the risks" })
          .click();
        await expect(checkbox).toBeChecked();
        await expect(activate).toBeEnabled();
        const checked = await capture(
          page,
          flowScreenshotFileName(ACTIVATION_WARNING_STOPS[theme][1], viewport),
          { fullPage: false },
        );
        await expect(checkbox).toBeChecked();
        await expect(page.locator("html")).toHaveClass(new RegExp(theme));
        const checkedIcon = checkbox.locator("..").locator("svg");
        await expect(checkedIcon.locator("path")).toHaveCount(2);
        await expect(checkedIcon).toBeInViewport({ ratio: 0.999 });
        const bounds = await checkedIcon.boundingBox();
        expect(bounds?.width).toBe(24);
        expect(bounds?.height).toBe(24);
        const checkedControl = {
          fileName: flowScreenshotFileName(
            ACTIVATION_WARNING_STOPS[theme][2],
            viewport,
          ),
          buffer: await checkedIcon.screenshot({ animations: "disabled" }),
        };
        await expect(checkbox).toBeChecked();
        assertRecordingCovered(backend, `activation risk warning in ${theme}`, [
          "eth-rpc",
          "graphql",
          "vp-health",
          "mempool",
        ]);
        await writeCaptures([unchecked, checked, checkedControl]);
      });
    }
  }
});
