import { expect, type Page } from "@playwright/test";

import { recordedPageWallets } from "../visual/capture";

import { connectInjectedWallets, injectPageWallets } from "./pageWallets";

export type ArtifactSurface = "activation" | "vault";
export const CANCEL_DOWNLOAD_TITLE = "Cancel artifact download?";
export const ARTIFACT_QUOTA_MESSAGE =
  "Too many artifact download requests. Wait and try again later.";
export const ARTIFACT_LEGACY_QUOTA_MESSAGE =
  "The vault provider limits downloads for this BTCVault. Wait before you try again. Contact the vault provider if the problem continues.";

/** Use the existing demo stream and the selected browser save path. */
export async function openArtifactDownload(
  page: Page,
  surface: ArtifactSurface,
  scenario = "valid",
  useFileSystemAccess = false,
) {
  await injectPageWallets(page, recordedPageWallets());
  if (!useFileSystemAccess)
    await page.addInitScript(() =>
      Object.defineProperty(window, "showSaveFilePicker", {
        value: undefined,
        configurable: true,
      }),
    );
  await page.goto(
    scenario === "quota"
      ? `/e2e/fixtures/artifactDownload.html?quota&surface=${surface}`
      : surface === "activation"
        ? "/vaults"
        : "/e2e/fixtures/artifactDownload.html",
    { waitUntil: "domcontentloaded" },
  );
  await connectInjectedWallets(page);
  await page.getByRole("button", { name: "God mode", exact: true }).click();
  await page.getByRole("button", { name: "Deposit & Vaults" }).click();
  await page
    .getByLabel("Mock artifact download")
    .filter({ visible: true })
    .check();
  if (scenario !== "valid" && scenario !== "quota")
    await page.getByLabel("Artifact response").selectOption(scenario);
  if (surface === "activation" && scenario !== "quota") {
    await page.getByLabel("Inject demo").filter({ visible: true }).check();
    await page.getByLabel("Hide real items").filter({ visible: true }).check();
    await page.getByLabel("Mock 1 step").fill("12");
    await expect(page.getByLabel("Mock 1 state")).toHaveText(/^Step 13:/);
  }
  await page.getByRole("button", { name: "Hide", exact: true }).click();
  if (surface === "activation" && scenario !== "quota")
    await page
      .getByTestId("pending-deposit-row")
      .first()
      .getByRole("button")
      .last()
      .click();
  else await page.getByTestId("open-artifact-download").click();
  await page
    .getByRole("button", { name: "Download Artifacts", exact: true })
    .click();
  if (scenario === "quota") {
    await expect(
      page
        .getByText(ARTIFACT_QUOTA_MESSAGE, { exact: true })
        .or(page.getByText(ARTIFACT_LEGACY_QUOTA_MESSAGE, { exact: true })),
    ).toBeVisible();
    return;
  }
  await expect(
    page.getByRole("heading", {
      name: "Downloading BTCVault artifacts",
      exact: true,
    }),
  ).toBeVisible();
  await page.clock.pauseAt(
    await page.evaluate(() => performance.timeOrigin + performance.now() + 10),
  );
  await page.clock.runFor(2_000);
  await expect(artifactProgress(page)).toBeVisible();
}

export function artifactClose(page: Page, surface: ArtifactSurface) {
  return page.getByTestId(
    surface === "activation"
      ? "activate-modal-close"
      : "artifact-download-modal-close",
  );
}

export function artifactProgress(page: Page) {
  return page
    .getByRole("heading", {
      name: "Downloading BTCVault artifacts",
      exact: true,
    })
    .locator("xpath=ancestor::div[contains(@class, 'bbn-dialog')][1]")
    .getByRole("progressbar");
}

export async function receivedProgress(page: Page) {
  return artifactProgress(page)
    .locator("div")
    .evaluate((element) => parseFloat(element.style.width));
}
