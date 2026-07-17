/**
 * The "pegin" action: drive a real signet + Sepolia peg-in end-to-end, from the deposit form through
 * all 15 `DepositFlowStep` steps to an active, borrowable vault on the dashboard.
 *
 * The work splits cleanly in two:
 *   - DAPP actions (this file drives them on `ctx.page`): open the deposit form, enter the amount,
 *     select a vault provider, submit, click "Sign Transaction" to start signing, then — mid-flow —
 *     acknowledge + "Activate Vault", "Skip" the artifact download, and finally "Go to Dashboard".
 *   - WALLET actions (the shared pop-up approver handles them on the chrome-extension pop-ups): the
 *     UniSat BTC signing prompts and the MetaMask ETH transactions. The approver is installed for
 *     the WHOLE run (unlike observe, which uninstalls it) so every pop-up auto-approves.
 *
 * With `--split` (`ctx.config.split`) the same flow runs a TWO-VAULT split deposit: the form's
 * "Two-vault split" option is selected (one provider, two HTLC outputs), and from the per-vault phase
 * the progress view fans into two columns — so there are more signing pop-ups and TWO Activate-Vault
 * ETH txs. The step machine handles both (the approver + re-armed Activate/Skip gates), and finishes
 * only when both columns reach the shared activated view.
 *
 * The 15-step machine is walked by AWAITING UI transitions (the `role="progressbar"` and the active
 * step's `aria-label="Step N active"`), never fixed sleeps, and tolerates the multi-minute on-chain
 * gates (Pre-PegIn inclusion, WOTS, payout) via a generous overall budget with no short per-step
 * timeout. The whole run is recorded (trace + HTTP fixtures) so a 30 min–2 hr flow is debuggable
 * offline instead of re-run blind.
 *
 * Selectors + copy strings below were verified against a real observe recording AND the React
 * components (DepositForm, VaultProviderSelector, DepositProgressView, ActivateConfirmationModal,
 * InStepArtifactCallout, VaultActivatedView, CollateralSection/CollateralVaultItem). No product/SDK
 * code is reimplemented — this only drives the UI; the frozen critical paths stay owned by the app.
 *
 * NEVER run without an explicit go-ahead: it spends real signet BTC + Sepolia ETH and is not
 * idempotent (a crash after the Pre-PegIn broadcast leaves an on-chain in-flight deposit).
 */
import type { Locator, Page } from "@playwright/test";

import {
  DEPOSIT_CTA_ENABLE_TIMEOUT_MS,
  FORM_SETTLE_MS,
  PROVIDER_LIST_TIMEOUT_MS,
  SPLIT_ALLOCATION_TIMEOUT_MS,
  STEP_TIMEOUT_MS,
} from "../timing";

import { installPopupApprover } from "./approver";
import { startRecording } from "./recording";
import { FLUID_CTA_SELECTOR } from "./selectors";
import { assertActivatedAndOnDashboard, walkStepMachine } from "./stepMachine";
import { type Action, type ActionContext } from "./types";
import { connectWallets } from "./walletConnect";

// Form-phase matchers use exact copy strings (verified against the deployed build the run drives) with
// a comment pointing at their `services/vault/src/copy.ts` source. Finish-line matchers below are
// tolerant regexes instead — the activated-view copy has been observed to drift between source and the
// deployed build, so those key on stable/actionable elements rather than exact wording.
const DEPOSIT_BUTTON_TESTID = '[data-testid="deposit-button"]'; // dashboard Collateral-section "Deposit"
const AMOUNT_PLACEHOLDER = "0"; // DepositForm amount input
const SELECT_VP_LABEL = "Select vault provider"; // COPY.deposit.form.selectVaultProvider
const DEPOSIT_CTA_LABEL = "Deposit"; // enabled DepositForm CTA (fluid button)
// The fluid CTA also renders these at-cap states (COPY.deposit.maxVaultsReached) — detect them so an
// at-cap position fails fast with a clear message instead of hitting the 90s CTA-enable timeout.
const MAX_VAULTS_CTA_LABEL = "Maximum BTC Vaults reached"; // COPY.deposit.maxVaultsReached.cta
const VAULT_COUNT_UNAVAILABLE_CTA_LABEL =
  "Unable to verify BTC Vault count — please try again"; // COPY.deposit.maxVaultsReached.unavailableCta
const SIGN_TRANSACTION_LABEL = "Sign Transaction"; // COPY.deposit.progress.buttons.signTransaction
// Two-vault split: the UtxoSplitSelector is an Accordion with NO testids (rows are `role="button"`
// divs), so it's driven by role + visible text. The selector header shows "Do not split" while
// single-vault (the default) and relabels to the split option once enabled.
const DO_NOT_SPLIT_TEXT = "Do not split"; // COPY.deposit.form.doNotSplit
const TWO_VAULT_SPLIT_RX = /Two-vault split/; // COPY.deposit.form.splitOptionLabel / TWO_VAULT_SPLIT_NAME

/**
 * Fill the deposit form (amount → provider → submit). The form has almost no testids, so selectors
 * are copy/role-driven and were verified against the real DOM. Returns once the deposit progress view
 * has opened (the fluid CTA click transitions to it).
 */
export async function fillDepositForm(
  page: Page,
  log: (m: string) => void,
  amountBtc: string,
  provider: string | undefined,
  split: boolean,
): Promise<void> {
  log(
    `Opening deposit form (${split ? "two-vault split, " : ""}amount ${amountBtc} sBTC, provider ${provider ?? "first available"})`,
  );
  await page
    .locator(DEPOSIT_BUTTON_TESTID)
    .first()
    .click({ timeout: STEP_TIMEOUT_MS });

  const amount = page.getByPlaceholder(AMOUNT_PLACEHOLDER).first();
  await amount.waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS });
  await amount.fill(amountBtc);
  await page.waitForTimeout(FORM_SETTLE_MS);

  if (split) await enableTwoVaultSplit(page, log, amountBtc);

  await selectVaultProvider(page, log, provider);

  const cta = await waitForDepositCta(page, log);
  log("Deposit CTA enabled — submitting the form");
  await cta.click();
}

/**
 * Switch the deposit into a two-vault split. Expand the `UtxoSplitSelector` (its header shows the
 * current choice — "Do not split" while single-vault), wait for the "Two-vault split" row to leave its
 * `aria-disabled` state (it stays disabled while the allocation computes and whenever the amount is
 * below the split minimum), then select it. If it never enables, the amount is below the form's split
 * minimum — surface the form's own `role="status"` threshold hint and fail loudly rather than silently
 * fall back to a single vault (real funds; never guess an amount).
 */
async function enableTwoVaultSplit(
  page: Page,
  log: (m: string) => void,
  amountBtc: string,
): Promise<void> {
  log("Enabling two-vault split");
  const splitRow = page
    .getByRole("button", { name: TWO_VAULT_SPLIT_RX })
    .first();

  // Expand the selector if the option rows aren't visible yet (collapsed header shows "Do not split").
  if (!(await splitRow.isVisible().catch(() => false))) {
    const header = page
      .getByRole("button", { name: DO_NOT_SPLIT_TEXT })
      .first();
    if (await header.isVisible().catch(() => false))
      await header.click().catch(() => {});
  }
  await splitRow.waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS });

  // Poll for the row to leave aria-disabled (allocation resolved AND amount clears the split minimum).
  const deadline = Date.now() + SPLIT_ALLOCATION_TIMEOUT_MS;
  let disabled = await splitRow.getAttribute("aria-disabled").catch(() => null);
  while (disabled === "true" && Date.now() < deadline) {
    await page.waitForTimeout(FORM_SETTLE_MS);
    disabled = await splitRow.getAttribute("aria-disabled").catch(() => null);
  }
  if (disabled === "true") {
    const hint = (
      await page
        .getByRole("status")
        .first()
        .innerText()
        .catch(() => "")
    )
      .replace(/\s+/g, " ")
      .trim();
    throw new Error(
      `Two-vault split stayed unavailable for ${amountBtc} sBTC — the form keeps it disabled${hint ? ` ("${hint}")` : ""}. Increase --amount above the split minimum.`,
    );
  }

  await splitRow.click();
  await page.waitForTimeout(FORM_SETTLE_MS);

  // Confirm the split took: the selector header relabels to the split option ("Two-vault split - <ratio>").
  const selectedLabel = (
    await page
      .getByRole("button", { name: TWO_VAULT_SPLIT_RX })
      .first()
      .innerText()
      .catch(() => "")
  )
    .replace(/\s+/g, " ")
    .trim();
  log(
    selectedLabel
      ? `Two-vault split selected: "${selectedLabel}"`
      : "⚠️ Clicked the two-vault split row but could not confirm the split label.",
  );
}

/**
 * Expand the provider accordion and select a provider row. Rows are `<button aria-pressed>`; the
 * unavailable ones carry the `disabled` attr (metadata-rejected VPs), so we only ever pick a
 * `:not([disabled])` row. Selecting collapses the accordion (the row then detaches), so selection is
 * NOT re-read from the row's `aria-pressed`; it's confirmed downstream by the CTA becoming "Deposit".
 */
async function selectVaultProvider(
  page: Page,
  log: (m: string) => void,
  provider: string | undefined,
): Promise<void> {
  await page
    .getByRole("button", { name: SELECT_VP_LABEL })
    .first()
    .click({ timeout: STEP_TIMEOUT_MS });

  const selectableRows = page.locator("button[aria-pressed]:not([disabled])");
  await selectableRows
    .first()
    .waitFor({ state: "visible", timeout: PROVIDER_LIST_TIMEOUT_MS });

  const row = provider
    ? selectableRows.filter({ hasText: provider }).first()
    : selectableRows.first();
  if (!(await row.isVisible().catch(() => false)))
    throw new Error(
      provider
        ? `Vault provider "${provider}" is not present or is unavailable in the picker`
        : "No selectable vault provider in the picker",
    );

  const name = (await row.innerText().catch(() => ""))
    .replace(/\s+/g, " ")
    .trim();
  await row.click();
  log(`Selected vault provider: ${name || provider || "first available"}`);
}

/**
 * Wait for the fluid form CTA to become the enabled "Deposit". It relabels as the form validates and
 * estimates fees ("Enter an amount" → "Select a vault provider" → "Calculating fees…" → "Checking for
 * inscriptions…" → "Deposit"), and is `disabled` throughout — so we wait for BOTH the exact "Deposit"
 * label AND enabled, logging each label change (this doubles as the fee-estimation progress log).
 */
async function waitForDepositCta(
  page: Page,
  log: (m: string) => void,
): Promise<Locator> {
  const cta = page.locator(FLUID_CTA_SELECTOR).first();
  const deadline = Date.now() + DEPOSIT_CTA_ENABLE_TIMEOUT_MS;
  let lastLabel = "";
  while (Date.now() < deadline) {
    const label = (await cta.textContent().catch(() => ""))?.trim() ?? "";
    if (label && label !== lastLabel) {
      log(`Deposit CTA: "${label}"`);
      lastLabel = label;
    }
    // The position is at its BTC-Vault cap (or the count couldn't be verified) — the form blocks the
    // deposit here. Fail fast with a clear message instead of waiting out the CTA-enable timeout. This
    // is the authoritative gate (the run.ts pre-flight is only a best-effort early check).
    if (label === MAX_VAULTS_CTA_LABEL)
      throw new Error(
        "Maximum BTC Vaults reached — the deposit form is blocking new peg-ins for this position (its BTC-Vault cap is full). Redeem/withdraw a vault or use a different ETH account.",
      );
    if (label === VAULT_COUNT_UNAVAILABLE_CTA_LABEL)
      throw new Error(
        "The deposit form could not verify this position's BTC-Vault count and is blocking the deposit — retry once the cap read recovers.",
      );
    if (
      label === DEPOSIT_CTA_LABEL &&
      (await cta.isEnabled().catch(() => false))
    )
      return cta;
    await page.waitForTimeout(FORM_SETTLE_MS);
  }
  throw new Error(
    `Deposit CTA did not become enabled "${DEPOSIT_CTA_LABEL}" within ${DEPOSIT_CTA_ENABLE_TIMEOUT_MS}ms (last label: "${lastLabel}")`,
  );
}

/** Click the single "Sign Transaction" start button that kicks off the whole signing sequence. */
export async function startSigning(
  page: Page,
  log: (m: string) => void,
): Promise<void> {
  const signButton = page
    .getByRole("button", { name: SIGN_TRANSACTION_LABEL, exact: true })
    .first();
  await signButton.waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS });
  log(
    "Deposit progress open — starting the signing sequence (Sign Transaction)",
  );
  await signButton.click();
}

/**
 * The pegin flow proper: deposit form → "Sign Transaction" → the 15-step signing machine → activated
 * vault on the dashboard. Assumes the caller has ALREADY connected the wallets and installed the
 * pop-up approver + recorder for the run (so a composite like `borrow --pegin-first` keeps a single
 * approver/recorder across both phases). `onStep` tags the recorder's HTTP fixtures with the current
 * phase and is forwarded into the step machine. Shared by the `pegin` action and `borrow --pegin-first`.
 */
export async function runPeginFlow(
  ctx: ActionContext,
  onStep: (step: string) => void,
): Promise<void> {
  const { page, context, log } = ctx;
  // Amount is resolved by the CLI to the fetched protocol minimum (or --amount). If it's unresolved
  // — the min-fetch failed non-interactively and no --amount was given — fail loudly rather than
  // silently depositing a stale hardcoded amount (CLAUDE.md: no silent fallbacks on critical paths).
  const amountBtc = ctx.config.peginAmountBtc?.trim();
  if (!amountBtc)
    throw new Error(
      "pegin: no deposit amount resolved — the minimum-deposit fetch failed and no --amount was given. Re-run with --amount=<btc>, or against a reachable network.",
    );
  const provider = ctx.config.peginProvider?.trim() || undefined;
  const split = ctx.config.split ?? false;

  onStep("deposit-form");
  await fillDepositForm(page, log, amountBtc, provider, split);

  onStep("sign-transaction");
  await startSigning(page, log);

  onStep("step-machine");
  const prePeginTxid = await walkStepMachine(
    page,
    context,
    log,
    split ? 2 : 1,
    onStep,
  );

  onStep("finish");
  await assertActivatedAndOnDashboard(
    page,
    log,
    amountBtc,
    prePeginTxid,
    split ? 2 : 1,
  );
  log(
    `✅ Pegin complete: ${split ? "two BTC Vaults" : "BTC Vault"} activated and shown on the dashboard.`,
  );
}

export const peginAction: Action = {
  id: "pegin",
  async run(ctx: ActionContext): Promise<void> {
    const { page, context, log, artifactsDir } = ctx;

    // Approver stays installed for the whole run (auto-approves every wallet pop-up).
    const handler = installPopupApprover(context, log);
    let currentStep = "connect";
    // No signing capture for pegin: the sign-conformance fixtures come from the `observe` run, and a
    // pegin doesn't need signing.jsonl — keeping it off shrinks the sensitive-artifact surface.
    const recorder = await startRecording(
      context,
      page,
      artifactsDir,
      log,
      () => currentStep,
    );
    try {
      await connectWallets(ctx);
      await runPeginFlow(ctx, (step) => {
        currentStep = step;
      });
    } finally {
      await recorder.stop();
      context.off("page", handler);
    }
  },
};
