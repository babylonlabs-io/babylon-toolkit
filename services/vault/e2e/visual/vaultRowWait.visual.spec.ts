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
  VAULT_WAIT_STOPS,
  VISUAL_VIEWPORTS,
} from "./targets";

type WaitScenario = keyof typeof VAULT_WAIT_STOPS;

/** Seed one demo deposit in the given scenario and return its status label. */
async function seedWaitingRow(page: Page, scenarioKey: WaitScenario) {
  return page.evaluate(
    async (modules) => {
      const { DEPOSIT_SCENARIOS, buildDepositsDemo } = (await import(
        /* @vite-ignore */ modules.demo
      )) as typeof import("../../src/dev/demoDeposit");
      const { setDepositOverride } = await import(
        /* @vite-ignore */ modules.deposits
      );
      const stateIndex = DEPOSIT_SCENARIOS.findIndex(
        (scenario) => scenario.key === modules.scenarioKey,
      );
      if (stateIndex < 0) throw new Error("The wait demo scenario is missing.");
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
      setDepositOverride(deposits);
      const [result] = [...deposits.resultsById.values()];
      return { displayLabel: result.peginState.displayLabel };
    },
    {
      demo: "/src/dev/demoDeposit.ts",
      deposits: "/src/overrides/deposits.ts",
      scenarioKey,
    },
  );
}

test.beforeAll(ensureOutputDir);

for (const viewport of VISUAL_VIEWPORTS) {
  for (const scenarioKey of Object.keys(VAULT_WAIT_STOPS) as WaitScenario[]) {
    test(`capture ${scenarioKey} at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      const backend = await preparePage(page);
      await injectPageWallets(page, recordedPageWallets());
      await page.goto("/vaults", { waitUntil: "domcontentloaded" });
      await connectInjectedWallets(page);
      const { displayLabel } = await seedWaitingRow(page, scenarioKey);

      // The status label reads the same on both sides of the comparison; the
      // sub-line under the amount is the surface the capture is for.
      await expect(
        page.getByText(displayLabel, { exact: true }).first(),
      ).toBeVisible();
      await expect(page.getByTestId("vaults-partial-load-error")).toHaveCount(
        0,
      );

      const shot = await capture(
        page,
        flowScreenshotFileName(VAULT_WAIT_STOPS[scenarioKey], viewport),
      );
      assertRecordingCovered(backend, `${scenarioKey} at ${viewport.name}`, [
        "eth-rpc",
        "graphql",
        "vp-health",
        "mempool",
      ]);
      await writeCaptures([shot]);
    });
  }
}
