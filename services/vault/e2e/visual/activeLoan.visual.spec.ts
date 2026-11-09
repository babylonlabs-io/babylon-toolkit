/**
 * Photographs an Active Loans row.
 *
 * The route capture photographs /loans disconnected and the recorded depositor
 * holds no position, so no wallet reaches a row. The god-mode gallery's demo
 * loan is the way in: it renders through the real `ActiveLoansList`, and only
 * the row's data is seeded.
 *
 * Like the other captures this asserts nothing about how the screen looks. It
 * guarantees the row is reached, populated, and photographed identically on
 * both sides of the comparison.
 */

import type { Page } from "@playwright/test";

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
  writeCaptures,
} from "./capture";
import {
  ACTIVE_LOAN_STOP,
  flowScreenshotFileName,
  LOAN_PICKER_STOPS,
  LOAN_PICKER_USES_COLOR_HOVER,
  VISUAL_VIEWPORTS,
} from "./targets";

/** The row's id is `demo-reserve-<key>`, for the one demo item seeded below. */
const ACTIVE_LOAN_ROW_TESTID = "active-loan-row-demo-reserve-1";

async function seedActiveLoan(page: Page): Promise<void> {
  await page.evaluate(
    async (modules) => {
      const { buildLoansDemo, loanScenarios } = (await import(
        /* @vite-ignore */ modules.demo
      )) as typeof import("../../src/dev/demoDeposit");
      const { setLoanOverride } = await import(
        /* @vite-ignore */ modules.loans
      );
      const stateIndex = loanScenarios("USDC").findIndex(
        (scenario) => scenario.key === "loan-borrowable",
      );
      if (stateIndex < 0) throw new Error("The loan demo scenario is missing.");
      setLoanOverride(
        buildLoansDemo(
          [
            {
              key: 1,
              type: "loan",
              stateIndex,
              amount: "1500",
              batched: false,
            },
          ],
          true,
          "USDC",
        ),
      );
    },
    {
      demo: "/src/dev/demoDeposit.ts",
      loans: "/src/overrides/loans.ts",
    },
  );
}

test.beforeAll(ensureOutputDir);
const IS_BASELINE = process.env.CAPTURE_ROOT?.endsWith("/baseline") === true;

for (const viewport of VISUAL_VIEWPORTS) {
  test(`capture an active loan at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    const backend = await preparePage(page);
    await injectPageWallets(page, recordedPageWallets());
    await page.goto("/loans", { waitUntil: "domcontentloaded" });
    await connectInjectedWallets(page);
    await seedActiveLoan(page);

    const row = page.getByTestId(ACTIVE_LOAN_ROW_TESTID);
    await expect(row).toBeVisible();
    await expect(row.getByText("Borrow APR", { exact: true })).toBeVisible();

    const shot = await capture(
      page,
      flowScreenshotFileName(ACTIVE_LOAN_STOP, viewport),
    );
    assertRecordingCovered(backend, `active loan at ${viewport.name}`, [
      "eth-rpc",
      "graphql",
      "vp-health",
      "mempool",
    ]);
    await writeCaptures([shot]);
  });
}

for (const theme of ["light", "dark"] as const) {
  for (const viewport of VISUAL_VIEWPORTS) {
    test(`capture the loan picker hover in ${theme} at ${viewport.name}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      const backend = await preparePage(page);
      await page.addInitScript(
        (value) => localStorage.setItem("theme", value),
        theme,
      );
      await injectPageWallets(page, recordedPageWallets());
      await page.goto("/e2e/fixtures/loanPickerHover.html", {
        waitUntil: "domcontentloaded",
      });
      await connectInjectedWallets(page);
      await page.addStyleTag({
        content: ".tsqd-parent-container { display: none !important; }",
      });
      await expect(page.locator("html")).toHaveClass(new RegExp(theme));
      const open = page.getByTestId("open-loan-hover");
      await open.click();
      const shots = [];
      for (const panel of ["asset", "hub"] as const) {
        const prefix = panel === "asset" ? "asset-select-row-" : "hub-option-";
        const control = page
          .locator(`[data-testid^="${prefix}"]:not([disabled])`)
          .first();
        const row = panel === "asset" ? control : control.locator("..");
        await row.scrollIntoViewIfNeeded();
        for (const hovered of [false, true]) {
          const usesColor =
            hovered && (!IS_BASELINE || LOAN_PICKER_USES_COLOR_HOVER[panel]);
          const background = usesColor
            ? theme === "light"
              ? "rgb(221, 221, 221)"
              : "rgb(47, 47, 47)"
            : theme === "light"
              ? "rgb(249, 249, 249)"
              : "rgb(32, 32, 32)";
          const filter = hovered && !usesColor ? "brightness(1.25)" : "none";
          await page.mouse.move(0, 0);
          if (hovered) await control.hover();
          if (panel === "hub") {
            await expect(control).toContainText("4.52%");
            await expect(control).toContainText("$35.5M");
          }
          await expect(control).toBeEnabled();
          await expect(row).toBeInViewport({ ratio: 0.999 });
          await expect(row).toHaveCSS("background-color", background);
          await expect(row).toHaveCSS("filter", filter);
          expect(
            await row.evaluate((element) => element.matches(":hover")),
          ).toBe(hovered);
          shots.push(
            await capture(
              page,
              flowScreenshotFileName(
                LOAN_PICKER_STOPS[theme][
                  `${panel}${hovered ? "Hover" : "Rest"}`
                ],
                viewport,
              ),
              { fullPage: false },
            ),
          );
          await expect(control).toBeEnabled();
          await expect(row).toBeInViewport({ ratio: 0.999 });
          await expect(row).toHaveCSS("background-color", background);
          await expect(row).toHaveCSS("filter", filter);
          if (panel === "hub") {
            await expect(control).toContainText("4.52%");
            await expect(control).toContainText("$35.5M");
          }
          expect(
            await row.evaluate((element) => element.matches(":hover")),
          ).toBe(hovered);
          await expect(page.locator("html")).toHaveClass(new RegExp(theme));
        }
        await page.keyboard.press("Escape");
        await page.getByLabel("At borrow limit").check();
        await open.click();
        const disabled = page
          .locator(`[data-testid^="${prefix}"][disabled]`)
          .first();
        const disabledRow =
          panel === "asset" ? disabled : disabled.locator("..");
        await disabledRow.scrollIntoViewIfNeeded();
        await disabled.hover();
        await expect(disabled).toBeDisabled();
        if (panel === "hub") {
          await expect(disabled).toContainText("4.52%");
          await expect(disabled).toContainText("$35.5M");
        }
        await expect(disabledRow).toHaveCSS("opacity", "0.4");
        await expect(disabledRow).toHaveCSS(
          "background-color",
          theme === "light" ? "rgb(249, 249, 249)" : "rgb(32, 32, 32)",
        );
        await expect(disabledRow).toHaveCSS("filter", "none");
        await expect(disabledRow).toBeInViewport({ ratio: 0.999 });
        expect(
          await disabledRow.evaluate((element) => element.matches(":hover")),
        ).toBe(true);
        shots.push(
          await capture(
            page,
            flowScreenshotFileName(
              LOAN_PICKER_STOPS[theme][`${panel}Disabled`],
              viewport,
            ),
            { fullPage: false },
          ),
        );
        await expect(disabled).toBeDisabled();
        if (panel === "hub") {
          await expect(disabled).toContainText("4.52%");
          await expect(disabled).toContainText("$35.5M");
        }
        await expect(disabledRow).toHaveCSS("opacity", "0.4");
        await expect(disabledRow).toHaveCSS(
          "background-color",
          theme === "light" ? "rgb(249, 249, 249)" : "rgb(32, 32, 32)",
        );
        await expect(disabledRow).toHaveCSS("filter", "none");
        await expect(disabledRow).toBeInViewport({ ratio: 0.999 });
        expect(
          await disabledRow.evaluate((element) => element.matches(":hover")),
        ).toBe(true);
        await expect(page.locator("html")).toHaveClass(new RegExp(theme));
        await expect(page.locator(".tsqd-parent-container")).toBeHidden();
        if (panel === "asset") {
          await page.keyboard.press("Escape");
          await page.getByLabel("At borrow limit").uncheck();
          await open.click();
          await control.click();
        }
      }
      assertRecordingCovered(
        backend,
        `loan picker hover ${theme} ${viewport.name}`,
        ["eth-rpc", "graphql", "vp-health", "mempool"],
      );
      await writeCaptures(shots);
    });
  }
}
