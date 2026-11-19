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
  flowScreenshotFileName,
  LOAN_NOTICE_STOPS,
  VISUAL_VIEWPORTS,
} from "./targets";

const EXPECT_REPAYMENT_NOTICE =
  !process.env.CAPTURE_ROOT?.endsWith("/baseline") ||
  readFileSync(new URL("../../src/copy.ts", import.meta.url), "utf8").includes(
    "When you reach this limit, fully repay an existing loan before you borrow a different asset.",
  );

test.beforeAll(ensureOutputDir);

for (const theme of ["light", "dark"] as const) {
  for (const limit of [1, 2] as const) {
    for (const viewport of VISUAL_VIEWPORTS) {
      test(`capture loan notice limit ${limit} in ${theme} at ${viewport.name}`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        const backend = await preparePage(page);
        await page.addInitScript(
          (value) => localStorage.setItem("theme", value),
          theme,
        );
        await injectPageWallets(page, recordedPageWallets());
        await page.goto("/loans", { waitUntil: "domcontentloaded" });
        await connectInjectedWallets(page);
        await page.evaluate(
          async ({ module, limit }) => {
            const { setBorrowReserveLimitOverride } = (await import(
              /* @vite-ignore */ module
            )) as typeof import("../../src/overrides/borrowReserveLimit");
            setBorrowReserveLimitOverride(limit);
          },
          { module: "/src/overrides/borrowReserveLimit.ts", limit },
        );
        const repaymentNotice =
          limit === 1
            ? "Once you choose an asset, your position is tied to it. When you reach this limit, fully repay an existing loan before you borrow a different asset."
            : "Once you choose an asset, this position can borrow 2 assets. When you reach this limit, fully repay an existing loan before you borrow a different asset.";
        const originalNotice =
          limit === 1
            ? "Once you choose an asset, your position is tied to it. To borrow a different asset, you'll need to create a new position."
            : "Once you choose an asset, this position can borrow 2 assets. To borrow a different asset, you'll need to create a new position.";
        const expected = EXPECT_REPAYMENT_NOTICE
          ? repaymentNotice
          : originalNotice;
        const notice = page.getByText(expected, { exact: true });
        await expect(
          page.getByText("No active loans", { exact: true }),
        ).toBeVisible();
        await expect(notice).toBeVisible();
        await notice.scrollIntoViewIfNeeded();
        await expect(notice).toBeInViewport({ ratio: 0.999 });
        await expect(page.locator("html")).toHaveClass(new RegExp(theme));
        const shot = await capture(
          page,
          flowScreenshotFileName(LOAN_NOTICE_STOPS[theme][limit], viewport),
          { fullPage: false },
        );
        await expect(notice).toHaveText(expected);
        await expect(notice).toBeInViewport({ ratio: 0.999 });
        await expect(page.locator("html")).toHaveClass(new RegExp(theme));
        assertRecordingCovered(
          backend,
          `loan notice limit ${limit} in ${theme}`,
          ["eth-rpc", "graphql", "vp-health", "mempool"],
        );
        await writeCaptures([shot]);
      });
    }
  }
}
