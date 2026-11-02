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
