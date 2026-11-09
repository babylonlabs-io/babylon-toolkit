import { expect, test } from "../fixtures";
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
  type StagedShot,
  writeCaptures,
} from "./capture";
import {
  flowScreenshotFileName,
  VISUAL_VIEWPORTS,
  WITHDRAW_RISK_ACKNOWLEDGEMENT,
} from "./targets";

test.beforeAll(ensureOutputDir);

for (const viewport of VISUAL_VIEWPORTS) {
  for (const theme of ["light", "dark"] as const) {
    test(`withdrawRisk-${theme}-${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const backend = await preparePage(page);
      await page.addInitScript(
        (value) => localStorage.setItem("theme", value),
        theme,
      );
      await injectPageWallets(page, recordedPageWallets());
      await page.goto("/e2e/fixtures/withdrawRisk.html", {
        waitUntil: "domcontentloaded",
      });
      await expect(page.locator("html")).toHaveClass(
        new RegExp(`\\b${theme}\\b`),
      );
      await page.addStyleTag({
        content: ".tsqd-parent-container { display: none !important; }",
      });
      await connectInjectedWallets(page);
      await page.getByTestId("open-withdraw-risk").click();
      const shots: StagedShot[] = [];
      for (const step of ["select", "review"] as const) {
        const acknowledgement = page.getByTestId(
          `withdraw-${step}-acknowledge`,
        );
        const label = acknowledgement.locator("xpath=ancestor::label");
        const action = page.getByTestId(
          step === "select"
            ? "withdraw-select-continue"
            : "withdraw-confirm-button",
        );
        for (const checked of [false, true]) {
          await acknowledgement.setChecked(checked);
          await label.scrollIntoViewIfNeeded();
          await action.scrollIntoViewIfNeeded();
          await expect(label).toHaveText(WITHDRAW_RISK_ACKNOWLEDGEMENT);
          await expect(label).toBeInViewport({ ratio: 0.999 });
          await expect(action).toBeInViewport({ ratio: 0.999 });
          await expect(page.locator(".tsqd-parent-container")).toBeHidden();
          await expect(acknowledgement).toBeChecked({ checked });
          await expect(action).toBeEnabled({ enabled: checked });
          await expect(page.locator("html")).toHaveClass(
            new RegExp(`\\b${theme}\\b`),
          );
          shots.push(
            await capture(
              page,
              flowScreenshotFileName(
                `withdraw-risk-${step}-${theme}-${checked ? "checked" : "unchecked"}`,
                viewport,
              ),
              { fullPage: false },
            ),
          );
          await expect(label).toHaveText(WITHDRAW_RISK_ACKNOWLEDGEMENT);
          await expect(label).toBeInViewport({ ratio: 0.999 });
          await expect(action).toBeInViewport({ ratio: 0.999 });
          await expect(page.locator(".tsqd-parent-container")).toBeHidden();
          await expect(acknowledgement).toBeChecked({ checked });
          await expect(action).toBeEnabled({ enabled: checked });
          await expect(page.locator("html")).toHaveClass(
            new RegExp(`\\b${theme}\\b`),
          );
        }
        if (step === "select") await action.click();
      }
      assertRecordingCovered(
        backend,
        `withdrawal risk ${theme} ${viewport.name}`,
        ["eth-rpc", "graphql", "vp-health", "mempool"],
      );
      await writeCaptures(shots);
    });
  }
}
