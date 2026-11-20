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
          page.getByRole("button", { name: "Download artifacts", exact: true }),
        ).toBeVisible();
        await page.clock.runFor(15_000);
        expect(downloads).toBe(0);
        await page.keyboard.press("Escape");
        await expect(
          page.getByRole("button", { name: "Download artifacts", exact: true }),
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
          .getByRole("button", { name: "Download artifacts", exact: true })
          .click();
        await artifactClose(page, surface).click();
        await page
          .getByRole("button", { name: "Yes, cancel download", exact: true })
          .click();
        await expect(
          page.getByRole("button", { name: "Download artifacts", exact: true }),
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
              name: "Download artifacts",
              exact: true,
            }),
          ).toBeVisible();
          await page.mouse.click(2, 2);
          await expect(
            page.getByRole("button", {
              name: "Download artifacts",
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
          const hex = (buffer: ArrayBuffer) =>
            Array.from(new Uint8Array(buffer), (byte) =>
              byte.toString(16).padStart(2, "0"),
            ).join("");
          const directory = await navigator.storage.getDirectory();
          const handle = await directory.getFileHandle(
            "babylon-vault-d1d1d1d1.tar",
          );
          const file = await handle.getFile();
          const bytes = new Uint8Array(await file.arrayBuffer());
          // Walk the ustar headers independently of the app's writer.
          const decoder = new TextDecoder();
          const entries: { name: string; data: Uint8Array }[] = [];
          let offset = 0;
          while (!bytes.subarray(offset, offset + 512).every((b) => b === 0)) {
            const header = bytes.subarray(offset, offset + 512);
            const nameEnd = header.indexOf(0);
            const name = decoder.decode(
              header.subarray(0, nameEnd === -1 ? 100 : Math.min(nameEnd, 100)),
            );
            const size = parseInt(decoder.decode(header.subarray(124, 135)), 8);
            const start = offset + 512;
            entries.push({ name, data: bytes.slice(start, start + size) });
            offset = start + Math.ceil(size / 512) * 512;
          }
          const session = entries[0]!;
          const claimEntry = entries[entries.length - 1]!;
          const claim = JSON.parse(decoder.decode(claimEntry.data));
          const graph = JSON.parse(claim.tx_graph_json);
          return {
            byteLength: file.size,
            modified: file.lastModified,
            sha256: hex(await crypto.subtle.digest("SHA-256", bytes)),
            names: entries.map((entry) => entry.name),
            claimFields: Object.keys(claim).sort(),
            claim: {
              vaultId: claim.vault_id,
              verifyingKey: claim.verifying_key_hex,
              depositorPk: graph.depositor_pubkey,
              claimOutpoint: graph.claim_tx.tx.input[0].previous_output,
              payoutOutpoint: graph.payout_tx.tx.input[0].previous_output,
              sessionHash: claim.sessions["ab".repeat(32)].sha256,
            },
            sessionSha256: hex(
              await crypto.subtle.digest("SHA-256", session.data),
            ),
            trailerZero:
              bytes.byteLength === offset + 1024 &&
              bytes.subarray(offset).every((b) => b === 0),
          };
        });
      let browserDownloads = 0;
      page.on("download", () => browserDownloads++);
      await openArtifactDownload(page, "vault", "valid", true);
      await page.clock.resume();
      const download = page.getByRole("button", {
        name: "Download artifacts",
        exact: true,
      });
      const error = page.locator(".bbn-dialog .text-error-main");
      await expect(download).toBeVisible({ timeout: 30_000 });
      await expect(error).toHaveCount(0);
      const saved = await readSavedFile();
      // One 8 MiB session plus its header and the claim entry.
      expect(saved.byteLength).toBeGreaterThan(8 * 1024 * 1024 + 512);
      expect(saved.names).toEqual([
        `sessions/${"ab".repeat(32)}.cbor`,
        "claim.json",
      ]);
      expect(saved.claimFields).toEqual(
        [
          "format",
          "format_version",
          "pegin_txid",
          "vault_id",
          "depositor_pk",
          "vault_provider",
          "signed_graph_fingerprint",
          "tx_graph_json",
          "verifying_key_hex",
          "sessions",
        ].sort(),
      );
      expect(saved.claim.sessionHash).toBe(saved.sessionSha256);
      expect(saved.trailerZero).toBe(true);
      expect(saved.claim).toMatchObject({
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
