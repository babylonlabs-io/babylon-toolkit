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
  flowScreenshotFileName,
  HAS_CONFIRMED_REFUND,
  HAS_REFUND_TX_LINK,
  VAULT_REFUND_STOPS,
  VISUAL_VIEWPORTS,
} from "./targets";

async function seedRefund(page: Page, phase: keyof typeof VAULT_REFUND_STOPS) {
  return page.evaluate(
    async (modules) => {
      const { DEPOSIT_SCENARIOS, buildDepositsDemo, activityScenarios } =
        (await import(
          /* @vite-ignore */ modules.demo
        )) as typeof import("../../src/dev/demoDeposit");
      const { setDepositOverride } = await import(
        /* @vite-ignore */ modules.deposits
      );
      const stateIndex = DEPOSIT_SCENARIOS.findIndex(
        (scenario) => scenario.key === `expired-${modules.phase}`,
      );
      if (stateIndex < 0)
        throw new Error("The refund demo scenario is missing.");
      const deposits = buildDepositsDemo(
        [
          {
            key: 1,
            type: "deposit",
            stateIndex,
            amount: "0.0375",
            batched: false,
          },
        ],
        true,
      );
      const deposit = deposits.expiredActivities[0];
      const scenario = activityScenarios("USDC").find(
        (item) => item.key === "act-deposit",
      );
      if (!scenario)
        throw new Error("The deposit activity scenario is missing.");
      const row = scenario.build(
        deposit.id,
        new Date(deposit.timestamp!),
        deposit.collateral.amount,
      );
      if (row.kind !== "row")
        throw new Error("Expected a deposit activity row.");
      // Reuse the gallery's Bitcoin hash for the refund polling result.
      const refundTxId = row.transactionHash;
      const result = deposits.resultsById.get(deposit.id)!;
      result.refundTxId = refundTxId;
      setDepositOverride(deposits);
      return {
        refundTxId,
        message: result.peginState.message,
        displayLabel: result.peginState.displayLabel,
      };
    },
    {
      demo: "/src/dev/demoDeposit.ts",
      deposits: "/src/overrides/deposits.ts",
      phase,
    },
  );
}

test.beforeAll(ensureOutputDir);

for (const viewport of VISUAL_VIEWPORTS) {
  for (const phase of ["refunding", "refunded"] as const) {
    test(`capture ${phase} in inactive vaults at ${viewport.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      const backend = await preparePage(page);
      await injectPageWallets(page, recordedPageWallets());
      await page.goto("/vaults", { waitUntil: "domcontentloaded" });
      await connectInjectedWallets(page);
      const { refundTxId, message, displayLabel } = await seedRefund(
        page,
        phase,
      );
      const section = page.locator("section").filter({
        has: page.getByRole("heading", {
          name: "Inactive Vaults (1)",
          exact: true,
        }),
      });

      if (
        HAS_REFUND_TX_LINK &&
        (phase === "refunding" || HAS_CONFIRMED_REFUND)
      ) {
        await expect(section).toBeVisible();
        await expect(
          section.getByText(displayLabel, { exact: true }),
        ).toBeVisible();
        await expect(
          section.getByText("Refund transaction", { exact: true }),
        ).toBeVisible();
        const link = section.getByRole("link");
        await expect(link).toHaveAttribute(
          "href",
          `https://mempool.space/signet/tx/${refundTxId}`,
        );
        await expect(link).toHaveAttribute("target", "_blank");
        await expect(
          section.getByRole("button", { name: /^Copy BTC transaction hash/ }),
        ).toBeVisible();
        await expect(
          section.getByRole("button", { name: "Withdraw", exact: true }),
        ).toHaveCount(0);
        if (viewport.name === "desktop") {
          await section
            .locator(`[data-tooltip-content=${JSON.stringify(message)}]`)
            .hover();
          await expect(page.getByRole("tooltip")).toHaveText(message!);
        }
      } else {
        // Keep the earlier UI's hidden refund row in the comparison.
        await expect(
          page.getByRole("heading", { name: /Inactive Vaults/ }),
        ).toHaveCount(0);
        await expect(page.getByText(displayLabel, { exact: true })).toHaveCount(
          0,
        );
        await expect(
          page.getByText("Your BTCVaults will appear here", { exact: true }),
        ).toBeVisible();
      }

      await expect(page.getByTestId("vaults-partial-load-error")).toHaveCount(
        0,
      );
      const shot = await capture(
        page,
        flowScreenshotFileName(VAULT_REFUND_STOPS[phase], viewport),
      );
      assertRecordingCovered(
        backend,
        `${phase} in inactive vaults at ${viewport.name}`,
        ["eth-rpc", "graphql", "vp-health", "mempool"],
      );
      await writeCaptures([shot]);
    });
  }
}
