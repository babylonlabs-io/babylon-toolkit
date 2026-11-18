import { readFileSync } from "node:fs";

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
  BORROW_HINT_STOPS,
  flowScreenshotFileName,
  VISUAL_VIEWPORTS,
} from "./targets";

const HAS_BORROW_HINT = readFileSync(
  new URL("../../src/copy.ts", import.meta.url),
  "utf8",
).includes("availableToBorrowTooltip:");
const HINT_TEXT = "This amount is in USD.";

const IS_BASELINE = process.env.CAPTURE_ROOT?.endsWith("/baseline") === true;
const EXPECT_BORROW_HINT = !IS_BASELINE || HAS_BORROW_HINT;

test.beforeAll(ensureOutputDir);

for (const theme of ["light", "dark"] as const) {
  for (const viewport of VISUAL_VIEWPORTS) {
    test.describe(`borrow hint ${theme} ${viewport.name}`, () => {
      test.use({
        isMobile: viewport.width < 768,
        hasTouch: viewport.width < 768,
      });
      for (const target of [
        { name: "overview", path: "/" },
        { name: "loans", path: "/loans" },
      ] as const) {
        test(`capture the ${target.name} borrow hint`, async ({ page }) => {
          await page.setViewportSize(viewport);
          const backend = await preparePage(page);
          await page.addInitScript(
            (value) => localStorage.setItem("theme", value),
            theme,
          );
          await injectPageWallets(page, recordedPageWallets());
          await page.goto(target.path, { waitUntil: "domcontentloaded" });
          await connectInjectedWallets(page);
          await expect(page.locator("html")).toHaveClass(new RegExp(theme));
          if (target.name === "loans") {
            await page
              .getByRole("button", { name: "God mode", exact: true })
              .click();
            await page
              .getByRole("button", { name: "Deposit & Vaults", exact: true })
              .click();
            await page.getByLabel("Inject demo").check();
            await page.getByLabel("Mock 1 type").selectOption("loan");
            await page
              .getByRole("button", { name: "Hide", exact: true })
              .click();
            await expect(
              page.getByTestId("active-loan-row-demo-reserve-1"),
            ).toBeVisible();
          }
          const label = page
            .getByText("Available to Borrow", { exact: true })
            .first();
          await expect(label).toBeVisible();
          await label.scrollIntoViewIfNeeded();
          if (EXPECT_BORROW_HINT) {
            if (viewport.width < 768) {
              await page
                .getByRole("button", {
                  name: "Available to Borrow",
                  exact: true,
                })
                .click();
              await expect(
                page.getByRole("dialog", {
                  name: "Available to Borrow",
                  exact: true,
                }),
              ).toBeVisible();
            } else {
              const trigger = label
                .locator("..")
                .locator("[data-tooltip-content]");
              await expect(trigger).toBeVisible();
              await trigger.hover();
            }
            await expect(
              page.getByText(HINT_TEXT, { exact: true }),
            ).toBeVisible();
            await expect(
              page.getByText(HINT_TEXT, { exact: true }),
            ).toBeInViewport({ ratio: 0.999 });
          } else {
            await label.hover();
          }
          const shot = await capture(
            page,
            flowScreenshotFileName(
              BORROW_HINT_STOPS[`${target.name}-${theme}`],
              viewport,
            ),
            { fullPage: false },
          );
          await expect(label).toBeVisible();
          if (EXPECT_BORROW_HINT) {
            await expect(
              page.getByText(HINT_TEXT, { exact: true }),
            ).toBeVisible();
            await expect(
              page.getByText(HINT_TEXT, { exact: true }),
            ).toBeInViewport({ ratio: 0.999 });
          }
          assertRecordingCovered(
            backend,
            `${target.name} borrow hint ${theme} ${viewport.name}`,
            ["eth-rpc", "graphql", "vp-health", "mempool"],
          );
          await writeCaptures([shot]);
        });
      }
    });
  }
}
