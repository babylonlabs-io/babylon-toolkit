import type { Locator, Page } from "@playwright/test";
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
  type StagedShot,
  STEP_MARKER,
  writeCaptures,
} from "./capture";
import {
  DEPOSIT_PROGRESS_STOPS,
  flowScreenshotFileName,
  VISUAL_VIEWPORTS,
} from "./targets";

const EXPECT_VERIFICATION_PROGRESS =
  !process.env.CAPTURE_ROOT?.endsWith("/baseline") ||
  readFileSync(
    new URL(
      "../../src/components/simple/DepositProgressView/ProviderWaitDetail.tsx",
      import.meta.url,
    ),
    "utf8",
  ).includes("collectingAcknowledgments");
const VERIFYING = "Verifying signatures and collecting ACKs";
const STUCK =
  "The vault provider is not responding. Your funds are not affected.";
const COUNTS = [
  "Collecting acknowledgments: 1 of 3",
  "Collecting acknowledgments: 2 of 3",
] as const;
const SCREENS = {
  counts: [DEPOSIT_PROGRESS_STOPS.verificationCounts],
  stuck: [DEPOSIT_PROGRESS_STOPS.verificationStuck],
  fallback: [DEPOSIT_PROGRESS_STOPS.verificationFallback],
  split: [
    DEPOSIT_PROGRESS_STOPS.verificationSplitFirst,
    DEPOSIT_PROGRESS_STOPS.verificationSplitSecond,
  ],
  mixed: [
    DEPOSIT_PROGRESS_STOPS.verificationMixedFirst,
    DEPOSIT_PROGRESS_STOPS.verificationMixedSecond,
  ],
} as const;
type State = keyof typeof SCREENS;

async function seedVerification(page: Page, state: State): Promise<void> {
  await page.evaluate(
    async ({ demo, overrides, state }) => {
      const { DEPOSIT_SCENARIOS, buildDepositsDemo } = (await import(
        /* @vite-ignore */ demo
      )) as typeof import("../../src/dev/demoDeposit");
      const { setDepositOverride } = (await import(
        /* @vite-ignore */ overrides
      )) as typeof import("../../src/overrides/deposits");
      const stateIndex = DEPOSIT_SCENARIOS.findIndex(
        (scenario) => scenario.key === "pending-step-12",
      );
      if (stateIndex < 0)
        throw new Error("The verification scenario is missing.");
      const batched = state === "split" || state === "mixed";
      const deposits = buildDepositsDemo(
        Array.from({ length: batched ? 2 : 1 }, (_, index) => ({
          key: index + 1,
          type: "deposit" as const,
          stateIndex,
          amount: "0.0375",
          batched,
        })),
        true,
      );
      for (const [index, result] of [
        ...deposits.resultsById.values(),
      ].entries()) {
        Object.assign(result, {
          providerVerification:
            state === "fallback"
              ? undefined
              : {
                  healthInfo:
                    state === "stuck" || (state === "mixed" && index === 1)
                      ? "stuck"
                      : "normal",
                  ackCollection: {
                    completed_challengers: index + 1,
                    total_challengers: 3,
                    completed_challenger_pubkeys: [],
                    pending_challenger_pubkeys: [],
                  },
                },
        });
      }
      setDepositOverride(deposits);
    },
    {
      demo: "/src/dev/demoDeposit.ts",
      overrides: "/src/overrides/deposits.ts",
      state,
    },
  );
}

async function assertVerification(modal: Locator, state: State): Promise<void> {
  const split = state === "split" || state === "mixed";
  await expect(
    modal.locator(`${STEP_MARKER}[aria-label$=" active"]`),
  ).toHaveCount(split ? 2 : 1);
  for (let index = 0; index < SCREENS[state].length; index++) {
    const lane = split
      ? modal.getByText(`BTCVault ${index + 1}`, { exact: true }).locator("..")
      : modal;
    const warning =
      EXPECT_VERIFICATION_PROGRESS &&
      (state === "stuck" || (state === "mixed" && index === 1));
    const counts =
      EXPECT_VERIFICATION_PROGRESS && !warning && state !== "fallback";
    await expect(lane.getByText(STUCK, { exact: true })).toHaveCount(
      warning ? 1 : 0,
    );
    await expect(lane.getByText(/^Collecting acknowledgments:/)).toHaveText(
      counts ? [COUNTS[index]] : [],
    );
    await expect(lane.getByText(VERIFYING, { exact: true })).toHaveCount(
      warning ? 0 : 1,
    );
    const statusRow = lane.getByText("Status:", { exact: true }).locator("..");
    await expect(statusRow.locator(".bbn-loader")).toHaveCount(warning ? 0 : 1);
  }
}

test.beforeAll(ensureOutputDir);

for (const viewport of VISUAL_VIEWPORTS) {
  for (const state of Object.keys(SCREENS) as State[]) {
    test(`capture provider verification ${state} at ${viewport.name}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      const backend = await preparePage(page);
      await injectPageWallets(page, recordedPageWallets());
      await page.goto("/vaults", { waitUntil: "domcontentloaded" });
      await connectInjectedWallets(page);
      await seedVerification(page, state);
      const rows = page.getByTestId("pending-deposit-row");
      await expect(rows).toHaveCount(SCREENS[state].length);
      await rows.first().getByRole("button").last().click();
      const modal = page.locator(".portal-root");
      const shots: StagedShot[] = [];
      for (const [index, stop] of SCREENS[state].entries()) {
        await assertVerification(modal, state);
        const lane =
          SCREENS[state].length === 2
            ? modal
                .getByText(`BTCVault ${index + 1}`, { exact: true })
                .locator("..")
            : modal;
        const text =
          EXPECT_VERIFICATION_PROGRESS && state !== "fallback"
            ? state === "stuck" || (state === "mixed" && index === 1)
              ? STUCK
              : COUNTS[index]
            : VERIFYING;
        const visibleDetail = lane.getByText(text, { exact: true });
        await visibleDetail.scrollIntoViewIfNeeded();
        await expect(visibleDetail).toBeInViewport({ ratio: 0.999 });
        shots.push(
          await capture(page, flowScreenshotFileName(stop, viewport), {
            fullPage: false,
          }),
        );
        await assertVerification(modal, state);
        await expect(visibleDetail).toBeInViewport({ ratio: 0.999 });
      }
      assertRecordingCovered(backend, `provider verification ${state}`, [
        "eth-rpc",
        "graphql",
        "vp-health",
        "mempool",
      ]);
      await writeCaptures(shots);
    });
  }
}
