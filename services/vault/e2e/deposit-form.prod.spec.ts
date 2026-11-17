/**
 * The deposit form works in the production bundle.
 *
 * Runs under `playwright.prod.config.ts`, against `vite build` + `vite
 * preview`, not the dev server every other spec uses. The form's fee estimate
 * (`useEstimatedBtcFee` → `fundingInputCap`) reads `globalThis.Buffer`, which
 * only the dev server's polyfill banner provides on its own; when the
 * production bundle lost its source of that global, the form crashed to
 * "Something went wrong" as soon as a wallet with UTXOs connected, and every
 * dev-server suite stayed green.
 *
 * The walk stops where the recorded backend and the injected wallets stop:
 * the submit button enabled and reading "Deposit". Enabled alone is not
 * enough - the connect, reload, unlock and reconnect states are enabled too
 * (`getDepositCtaState` in `services/deposit/validations.ts`); "Deposit" is
 * the only one that comes after the fee estimate over the wallet's UTXOs.
 * Signing is out of reach; the injected wallets never sign.
 */

import { expect, test } from "@playwright/test";

import {
  connectInjectedWallets,
  injectPageWallets,
} from "./fixtures/pageWallets";
import { installRecordedBackend } from "./fixtures/replay";
import { FLUID_CTA_SELECTOR } from "./real/actions/selectors";
import {
  assertNoErrorSurface,
  assertRecordingCovered,
  blockOffsiteRequests,
  recordedPageWallets,
} from "./visual/capture";

/**
 * Above the deployment's minimum deposit and below the recorded wallet's
 * balance and the two-vault minimum, so the form submits one vault (the same
 * window `visual/depositFlow.visual.spec.ts` submits in).
 */
const AMOUNT_TO_SUBMIT_BTC = "0.02";

/**
 * The CTA label once the form validates and the fee is estimated: the final
 * state of `getDepositCtaState` (`services/deposit/validations.ts`).
 */
const SUBMITTABLE_CTA_LABEL = "Deposit";

/** `COPY.deposit.form.selectVaultProvider`, matched as the real-wallet CLI does. */
const SELECT_PROVIDER_LABEL = "Select vault provider";
const SELECTABLE_PROVIDER_ROW = "button[aria-pressed]:not([disabled])";

test("the production bundle's deposit form estimates fees over the wallet's UTXOs", async ({
  page,
}) => {
  await blockOffsiteRequests(page);
  const backend = await installRecordedBackend(page);
  await injectPageWallets(page, recordedPageWallets());

  await page.goto("/vaults", { waitUntil: "domcontentloaded" });
  await connectInjectedWallets(page);
  await page.getByTestId("deposit-button").first().click();

  const dialog = page.locator(".portal-root");
  const amountInput = dialog.locator("input").first();
  await amountInput.fill(AMOUNT_TO_SUBMIT_BTC);
  await dialog.getByRole("button", { name: SELECT_PROVIDER_LABEL }).click();
  await dialog.locator(SELECTABLE_PROVIDER_ROW).first().click();

  const submit = dialog.locator(FLUID_CTA_SELECTOR);
  await expect(submit).toBeEnabled();
  await expect(submit).toHaveText(SUBMITTABLE_CTA_LABEL);
  await assertNoErrorSurface(page, "production deposit form");
  assertRecordingCovered(backend, "production deposit form", [
    "eth-rpc",
    "graphql",
    "vp-health",
    "mempool",
  ]);
});
