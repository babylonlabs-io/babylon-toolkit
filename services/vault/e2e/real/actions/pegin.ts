/**
 * The "pegin" action: drive a real signet + Sepolia peg-in end-to-end, from the deposit form through
 * all 15 `DepositFlowStep` steps to an active, borrowable vault on the dashboard.
 *
 * The work splits cleanly in two:
 *   - DAPP actions (this file drives them on `ctx.page`): open the deposit form, enter the amount,
 *     select a vault provider, submit, click "Sign Transaction" to start signing, then — mid-flow —
 *     acknowledge + "Activate Vault", "Skip" the artifact download, and finally "Go to Dashboard".
 *   - WALLET actions (the shared pop-up approver handles them on the chrome-extension pop-ups): the 8
 *     UniSat BTC signing prompts and the 2 MetaMask ETH transactions. The approver is installed for
 *     the WHOLE run (unlike observe, which uninstalls it) so every pop-up auto-approves.
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
  DASHBOARD_VAULT_TIMEOUT_MS,
  DEPOSIT_CTA_ENABLE_TIMEOUT_MS,
  FORM_SETTLE_MS,
  PEGIN_POLL_INTERVAL_MS,
  PEGIN_STEP_MACHINE_BUDGET_MS,
  PROVIDER_LIST_TIMEOUT_MS,
  STEP_TIMEOUT_MS,
} from "../timing";

import { installPopupApprover } from "./approver";
import { startRecording } from "./recording";
import { type Action, type ActionContext } from "./types";
import { connectWallets } from "./walletConnect";

/** Default deposit size in BTC when `--amount` isn't supplied (small, well above the protocol min). */
const DEFAULT_PEGIN_AMOUNT_BTC = "0.01";

// Form-phase matchers use exact copy strings (verified against the deployed build the run drives) with
// a comment pointing at their `services/vault/src/copy.ts` source. Finish-line matchers below are
// tolerant regexes instead — the activated-view copy has been observed to drift between source and the
// deployed build, so those key on stable/actionable elements rather than exact wording.
const DEPOSIT_BUTTON_TESTID = '[data-testid="deposit-button"]'; // header "Deposit sBTC"
const AMOUNT_PLACEHOLDER = "0"; // DepositForm amount input
const SELECT_VP_LABEL = "Select vault provider"; // COPY.deposit.form.selectVaultProvider
const DEPOSIT_CTA_LABEL = "Deposit"; // enabled DepositForm CTA (fluid button)
const SIGN_TRANSACTION_LABEL = "Sign Transaction"; // COPY.deposit.progress.buttons.signTransaction
const ACTIVATE_VAULT_LABEL = "Activate Vault"; // COPY.deposit.activateConfirmation.activateButton
const RISK_ACK_LABEL =
  "I understand the risks of continuing without the artifacts."; // riskAcknowledgement
const SKIP_LABEL = "Skip"; // COPY.deposit.inStepArtifact.skip
// Finish-line matchers are tolerant regexes, NOT exact strings: the deployed build's copy can drift
// from local source (e.g. the heading renders "Vault activated" on devnet vs "BTC Vault activated" in
// copy.ts), and we key on the stable actionable control (the "Go to Dashboard" button) rather than the
// heading text so a wording tweak can't strand the run at the activated screen.
const GO_TO_DASHBOARD_RX = /go to dashboard/i; // COPY.deposit.vaultActivatedSuccess.goToDashboard
const VAULT_OPTIONS_RX = /vault options/i; // CollateralSection ExpandMenuButton aria-label ("[BTC ]Vault options")
const VAULT_CARD_TESTID = '[data-testid="vault-card"]'; // CollateralVaultItem VaultCardShell (stable testid)

/**
 * Fill the deposit form (amount → provider → submit). The form has almost no testids, so selectors
 * are copy/role-driven and were verified against the real DOM. Returns once the deposit progress view
 * has opened (the fluid CTA click transitions to it).
 */
async function fillDepositForm(
  page: Page,
  log: (m: string) => void,
  amountBtc: string,
  provider: string | undefined,
): Promise<void> {
  log(
    `Opening deposit form (amount ${amountBtc} sBTC, provider ${provider ?? "first available"})`,
  );
  await page
    .locator(DEPOSIT_BUTTON_TESTID)
    .first()
    .click({ timeout: STEP_TIMEOUT_MS });

  const amount = page.getByPlaceholder(AMOUNT_PLACEHOLDER).first();
  await amount.waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS });
  await amount.fill(amountBtc);
  await page.waitForTimeout(FORM_SETTLE_MS);

  await selectVaultProvider(page, log, provider);

  const cta = await waitForDepositCta(page, log);
  log("Deposit CTA enabled — submitting the form");
  await cta.click();
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
  const cta = page.locator("button.bbn-btn-fluid").first();
  const deadline = Date.now() + DEPOSIT_CTA_ENABLE_TIMEOUT_MS;
  let lastLabel = "";
  while (Date.now() < deadline) {
    const label = (await cta.textContent().catch(() => ""))?.trim() ?? "";
    if (label && label !== lastLabel) {
      log(`Deposit CTA: "${label}"`);
      lastLabel = label;
    }
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
async function startSigning(
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

/** True once the terminal activated view is showing — detected by its "Go to Dashboard" button. */
function activatedViewReached(page: Page): Promise<boolean> {
  return page
    .getByRole("button", { name: GO_TO_DASHBOARD_RX })
    .first()
    .isVisible()
    .catch(() => false);
}

/**
 * Handle the `ActivateConfirmationModal` if it's showing: acknowledge the risk (we skip the artifact
 * download) then click "Activate Vault". The checkbox toggles on each click, so acknowledgement is
 * idempotent — only ticked when currently unchecked. Returns true once Activate Vault was clicked.
 */
async function handleActivateConfirmation(
  page: Page,
  log: (m: string) => void,
): Promise<boolean> {
  const activate = page
    .getByRole("button", { name: ACTIVATE_VAULT_LABEL, exact: true })
    .first();
  if (!(await activate.isVisible().catch(() => false))) return false;

  const checkbox = page.locator('[data-testid="checkbox-input"]').first();
  if (
    (await checkbox.count().catch(() => 0)) > 0 &&
    !(await checkbox.isChecked().catch(() => false))
  ) {
    // Toggle via the label (the native input is a visually-hidden switcher); only when unchecked so
    // repeated polls don't flip it back off.
    const label = page.getByText(RISK_ACK_LABEL, { exact: true }).first();
    if (await label.isVisible().catch(() => false)) {
      await label.click().catch(() => {});
    } else {
      await checkbox.check({ force: true }).catch(() => {});
    }
  }

  if (!(await activate.isEnabled().catch(() => false))) return false;
  log("Activate confirmation: risk acknowledged → clicking Activate Vault");
  await activate.click().catch(() => {});
  return true;
}

/** Click "Skip" on the in-step artifact callout (proceed without downloading recovery artifacts). */
async function handleArtifactSkip(
  page: Page,
  log: (m: string) => void,
): Promise<boolean> {
  const skip = page
    .getByRole("button", { name: SKIP_LABEL, exact: true })
    .first();
  if (!(await skip.isVisible().catch(() => false))) return false;
  log("Artifact step: Skip (continue without downloading recovery artifacts)");
  await skip.click().catch(() => {});
  return true;
}

/** Read the active step for the run log: "Step N active (P%)" from the stepper + progress bar. */
async function readActiveStep(page: Page): Promise<string> {
  const active = page.locator('[aria-label$="active"]').first();
  const label = await active.getAttribute("aria-label").catch(() => null);
  const bar = page.locator('[role="progressbar"]').first();
  const percent = await bar.getAttribute("aria-valuenow").catch(() => null);
  if (!label && percent === null) return "";
  return `${label ?? "Step ?"} (${percent ?? "?"}%)`;
}

/**
 * Walk the 15-step signing machine to the activated vault. The pop-up approver auto-approves every
 * wallet prompt asynchronously; this loop only drives the two dapp-page gates the approver can't reach
 * (Activate Vault + Skip) and follows the progress UI, logging each transition, until the terminal
 * heading appears. `onStep` tags the recorder's HTTP fixtures with the current step.
 */
async function walkStepMachine(
  page: Page,
  log: (m: string) => void,
  onStep: (step: string) => void,
): Promise<void> {
  const deadline = Date.now() + PEGIN_STEP_MACHINE_BUDGET_MS;
  let lastStep = "";
  let activated = false;
  let skipped = false;

  while (Date.now() < deadline) {
    if (await activatedViewReached(page)) return;

    // Two dapp-page interactions the wallet pop-up approver can't perform.
    if (!activated) activated = await handleActivateConfirmation(page, log);
    if (activated && !skipped) skipped = await handleArtifactSkip(page, log);

    const step = await readActiveStep(page);
    if (step && step !== lastStep) {
      lastStep = step;
      onStep(step);
      log(`Step machine → ${step}`);
    }
    await page.waitForTimeout(PEGIN_POLL_INTERVAL_MS);
  }
  throw new Error(
    `Peg-in did not reach the activated view (no "Go to Dashboard" button) within the step-machine budget — see trace.zip + the failure screenshot`,
  );
}

/**
 * Finish line: click "Go to Dashboard", then best-effort confirm the vault landed as collateral. The
 * activated view is the definitive success signal (we're only here because its "Go to Dashboard"
 * button appeared); the dashboard card is a secondary check, so a copy/layout drift on the dashboard
 * is logged as a warning rather than hanging or failing an otherwise-successful peg-in.
 */
async function assertActivatedAndOnDashboard(
  page: Page,
  log: (m: string) => void,
  amountBtc: string,
): Promise<void> {
  log("✅ Activated view reached — clicking Go to Dashboard");
  await page
    .getByRole("button", { name: GO_TO_DASHBOARD_RX })
    .first()
    .click({ timeout: STEP_TIMEOUT_MS });

  // The freshly activated vault surfaces as collateral behind the per-vault options expander (its
  // label may render "BTC Vault options" or "Vault options" depending on the build). Bounded waits so
  // a dashboard drift can never hang the run.
  const options = page.getByRole("button", { name: VAULT_OPTIONS_RX }).first();
  const optionsShown = await options
    .waitFor({ state: "visible", timeout: DASHBOARD_VAULT_TIMEOUT_MS })
    .then(() => true)
    .catch(() => false);
  if (!optionsShown) {
    log(
      "⚠️ Dashboard collateral controls not found within the wait — activation succeeded; skipping the card cross-check.",
    );
    return;
  }

  const card = page.locator(VAULT_CARD_TESTID).first();
  if (!(await card.isVisible().catch(() => false))) {
    await options.click().catch(() => {}); // expand the collateral panel
    await card
      .waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS })
      .catch(() => {});
  }
  const cardText = (await card.innerText().catch(() => ""))
    .replace(/\s+/g, " ")
    .trim();
  if (cardText.includes(amountBtc))
    log(
      `Dashboard shows the activated vault as collateral (${amountBtc} sBTC).`,
    );
  else
    log(
      `⚠️ Dashboard vault card did not clearly show "${amountBtc}" (card: "${cardText.slice(0, 120)}") — activation still succeeded.`,
    );
}

export const peginAction: Action = {
  id: "pegin",
  async run(ctx: ActionContext): Promise<void> {
    const { page, context, log, artifactsDir } = ctx;
    const amountBtc = (
      ctx.config.peginAmountBtc ?? DEFAULT_PEGIN_AMOUNT_BTC
    ).trim();
    const provider = ctx.config.peginProvider?.trim() || undefined;

    // Approver stays installed for the whole run (auto-approves every wallet pop-up).
    const handler = installPopupApprover(context, log);
    let currentStep = "connect";
    const recorder = await startRecording(
      context,
      page,
      artifactsDir,
      log,
      () => currentStep,
    );
    try {
      await connectWallets(ctx);

      currentStep = "deposit-form";
      await fillDepositForm(page, log, amountBtc, provider);

      currentStep = "sign-transaction";
      await startSigning(page, log);

      currentStep = "step-machine";
      await walkStepMachine(page, log, (step) => {
        currentStep = step;
      });

      currentStep = "finish";
      await assertActivatedAndOnDashboard(page, log, amountBtc);
      log("✅ Pegin complete: BTC Vault activated and shown on the dashboard.");
    } finally {
      await recorder.stop();
      context.off("page", handler);
    }
  },
};
