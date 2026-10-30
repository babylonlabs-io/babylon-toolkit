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
        await expect(confirmation).toHaveCount(0);
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
        await page.keyboard.press("Escape");
        await expect(
          page.getByRole("button", { name: "Download Artifacts", exact: true }),
        ).toHaveCount(0);

        await (
          surface === "activation"
            ? page
                .getByTestId("pending-deposit-row")
                .first()
                .getByRole("button")
                .last()
            : page.getByTestId("open-artifact-download")
        ).click();

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
          await page.mouse.click(2, 2);
          await expect(
            page.getByRole("button", {
              name: "Download Artifacts",
              exact: true,
            }),
          ).toHaveCount(0);
        });
      }
    });
  }
}

test.describe("native artifact saving", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.clock.install();
    await blockOffsiteRequests(page);
    await installRecordedBackend(page);
    // Replace only the picker. The browser owns the file and writable stream.
    await page.addInitScript(() =>
      Object.defineProperty(window, "showSaveFilePicker", {
        configurable: true,
        value: async ({ suggestedName }: { suggestedName: string }) => {
          const directory = await navigator.storage.getDirectory();
          return directory.getFileHandle(suggestedName, { create: true });
        },
      }),
    );
  });

  for (const failure of ["cancelled", "truncated"] as const) {
    test(`preserves the saved file after a ${failure} transfer and saves a retry`, async ({
      page,
    }) => {
      const readSavedFile = () =>
        page.evaluate(async () => {
          const directory = await navigator.storage.getDirectory();
          const handle = await directory.getFileHandle(
            "babylon-vault-artifacts-d1d1d1d1.json",
          );
          const file = await handle.getFile();
          const bytes = await file.arrayBuffer();
          const result = JSON.parse(new TextDecoder().decode(bytes));
          const graph = JSON.parse(result.tx_graph_json);
          const hex =
            result.babe_sessions["ab".repeat(32)].decryptor_artifacts_hex;
          return {
            byteLength: file.size,
            modified: file.lastModified,
            sha256: Array.from(
              new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
              (byte) => byte.toString(16).padStart(2, "0"),
            ).join(""),
            fields: Object.keys(result).sort(),
            completeHex: hex === "ab".repeat((8 * 1024 * 1024) / 2),
            verifyingKey: result.verifying_key_hex,
            depositorPk: graph.depositor_pubkey,
            claimOutpoint: graph.claim_tx.tx.input[0].previous_output,
            payoutOutpoint: graph.payout_tx.tx.input[0].previous_output,
          };
        });
      let browserDownloads = 0;
      page.on("download", () => browserDownloads++);
      await openArtifactDownload(page, "vault", "valid", true);
      await page.clock.resume();
      const download = page.getByRole("button", {
        name: "Download Artifacts",
        exact: true,
      });
      const error = page.locator(".bbn-dialog .text-error-main");
      await expect(download).toBeVisible({ timeout: 30_000 });
      await expect(error).toHaveCount(0);
      const saved = await readSavedFile();
      expect(saved.byteLength).toBeGreaterThan(8 * 1024 * 1024);
      expect(saved).toMatchObject({
        fields: ["babe_sessions", "tx_graph_json", "verifying_key_hex"],
        completeHex: true,
        verifyingKey: "abcdef01",
        depositorPk: "a".repeat(64),
        claimOutpoint: `${"d1".repeat(32)}:1`,
        payoutOutpoint: `${"d1".repeat(32)}:0`,
      });

      for (const attempt of [failure, "retry"]) {
        if (failure === "truncated") {
          await page.keyboard.press("Escape");
          await page
            .getByRole("button", { name: "God mode", exact: true })
            .click();
          await page.getByRole("button", { name: "Deposit & Vaults" }).click();
          await page
            .getByLabel("Artifact response")
            .selectOption(attempt === "retry" ? "valid" : "truncated");
          await page.getByRole("button", { name: "Hide", exact: true }).click();
          await page.getByTestId("open-artifact-download").click();
        }
        await download.click();
        await expect(artifactProgress(page)).toBeVisible();
        if (attempt === "cancelled") {
          await expect.poll(() => receivedProgress(page)).toBeGreaterThan(0);
          await page
            .getByRole("button", { name: "Cancel download", exact: true })
            .click();
          await expect(
            page.getByRole("heading", {
              name: CANCEL_DOWNLOAD_TITLE,
              exact: true,
            }),
          ).toBeVisible();
          await page
            .getByRole("button", { name: "Yes, cancel download", exact: true })
            .click();
        }
        await expect(download).toBeVisible({ timeout: 30_000 });
        await expect(artifactProgress(page)).toBeHidden();
        const current = await readSavedFile();
        if (attempt === "retry") {
          await expect(error).toHaveCount(0);
          expect(current.modified).toBeGreaterThan(saved.modified);
          expect({ ...current, modified: saved.modified }).toEqual(saved);
        } else {
          expect(current).toEqual(saved);
          if (attempt === "truncated") await expect(error).toBeVisible();
          else await expect(error).toHaveCount(0);
        }
      }

      // A dismissed picker must leave the previous file intact.
      const beforePickerCancel = await readSavedFile();
      await page.evaluate(() =>
        Object.defineProperty(window, "showSaveFilePicker", {
          configurable: true,
          value: async () => {
            throw new DOMException("The user aborted a request.", "AbortError");
          },
        }),
      );
      await download.click();
      await expect(download).toBeVisible();
      await expect(artifactProgress(page)).toBeHidden();
      await expect(error).toHaveCount(0);
      expect(await readSavedFile()).toEqual(beforePickerCancel);
      expect(browserDownloads).toBe(0);
    });
  }
});
