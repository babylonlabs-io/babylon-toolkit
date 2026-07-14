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
import type { BrowserContext, Locator, Page } from "@playwright/test";

import {
  DASHBOARD_VAULT_TIMEOUT_MS,
  DEPOSIT_CTA_ENABLE_TIMEOUT_MS,
  FORM_SETTLE_MS,
  PEGIN_POLL_INTERVAL_MS,
  PEGIN_STEP_MACHINE_BUDGET_MS,
  PROVIDER_LIST_TIMEOUT_MS,
  SPLIT_ALLOCATION_TIMEOUT_MS,
  STEP_TIMEOUT_MS,
} from "../timing";

import { installPopupApprover, sweepApprovals } from "./approver";
import { startRecording } from "./recording";
import { FLUID_CTA_SELECTOR, firstByTestid } from "./selectors";
import { type Action, type ActionContext } from "./types";
import { connectWallets } from "./walletConnect";

// Form-phase matchers use exact copy strings (verified against the deployed build the run drives) with
// a comment pointing at their `services/vault/src/copy.ts` source. Finish-line matchers below are
// tolerant regexes instead — the activated-view copy has been observed to drift between source and the
// deployed build, so those key on stable/actionable elements rather than exact wording.
const DEPOSIT_BUTTON_TESTID = '[data-testid="deposit-button"]'; // header "Deposit sBTC"
const AMOUNT_PLACEHOLDER = "0"; // DepositForm amount input
const SELECT_VP_LABEL = "Select vault provider"; // COPY.deposit.form.selectVaultProvider
const DEPOSIT_CTA_LABEL = "Deposit"; // enabled DepositForm CTA (fluid button)
// The fluid CTA also renders these at-cap states (COPY.deposit.maxVaultsReached) — detect them so an
// at-cap position fails fast with a clear message instead of hitting the 90s CTA-enable timeout.
const MAX_VAULTS_CTA_LABEL = "Maximum BTC Vaults reached"; // COPY.deposit.maxVaultsReached.cta
const VAULT_COUNT_UNAVAILABLE_CTA_LABEL =
  "Unable to verify BTC Vault count — please try again"; // COPY.deposit.maxVaultsReached.unavailableCta
const SIGN_TRANSACTION_LABEL = "Sign Transaction"; // COPY.deposit.progress.buttons.signTransaction
// The activation modal's confirm button. Selected testid-first (stable + text-independent) with a
// tolerant-text fallback: the button copy drifts (COPY.deposit.activateConfirmation.activateButton
// renders "Activate vault", lowercase v — an exact string silently stalled the run here), and the
// data-testid isn't on the deployed build until it ships, so the fallback carries the current build.
const ACTIVATE_VAULT_TESTID = '[data-testid="activate-vault-button"]';
const ACTIVATE_VAULT_RX = /activate vault/i; // COPY.deposit.activateConfirmation.activateButton

/** The activation modal's confirm button — testid if present (future-proof), else tolerant wording. */
function activateButton(page: Page): Locator {
  return firstByTestid(
    page,
    ACTIVATE_VAULT_TESTID,
    page.getByRole("button", { name: ACTIVATE_VAULT_RX }),
  );
}
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
async function fillDepositForm(
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
  const activate = activateButton(page);
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

/**
 * Capture this deposit's Pre-PegIn txid from the progress view. Explorer links render as
 * `<host>/tx/<txid>` anchors (CopyableHash); the depositor broadcasts + links the Pre-PegIn early in
 * the flow (well before the VP broadcasts the peg-in), so the first BTC txid to appear is this run's
 * Pre-PegIn. Used to pin the dashboard cross-check to THIS run's vault — a returning depositor's
 * dashboard lists several. Scans hrefs Node-side (no page-context function) and skips ETH links: an
 * ETH `/tx/0x…` hash never matches the 64-hex-no-0x BTC pattern.
 */
async function readPrePeginTxid(page: Page): Promise<string | undefined> {
  const links = page.locator('a[href*="/tx/"]');
  const count = await links.count().catch(() => 0);
  for (let i = 0; i < count; i++) {
    const href = await links
      .nth(i)
      .getAttribute("href")
      .catch(() => null);
    const match = href?.match(/\/tx\/([0-9a-fA-F]{64})(?:$|[/?#])/);
    if (match) return match[1].toLowerCase();
  }
  return undefined;
}

/**
 * Read the active step(s) for the run log: "Step N active (P%)" from the stepper + progress bar. In a
 * two-vault split the progress view shows two per-vault columns, each emitting its own
 * `aria-label="Step N active"` (the columns carry no distinguishing testid), so we collect ALL active
 * labels — the two lanes advance independently and may sit on different steps. The single progressbar
 * reflects the aggregate (slowest lane).
 */
async function readActiveStep(page: Page): Promise<string> {
  const actives = page.locator('[aria-label$="active"]');
  const count = await actives.count().catch(() => 0);
  const labels: string[] = [];
  for (let i = 0; i < count; i++) {
    const label = await actives
      .nth(i)
      .getAttribute("aria-label")
      .catch(() => null);
    if (label && !labels.includes(label)) labels.push(label);
  }
  const bar = page.locator('[role="progressbar"]').first();
  const percent = await bar.getAttribute("aria-valuenow").catch(() => null);
  if (labels.length === 0 && percent === null) return "";
  return `${labels.length ? labels.join(", ") : "Step ?"} (${percent ?? "?"}%)`;
}

// The per-vault "WOTS key submission skipped" warning the app shows when the vault provider isn't ready
// for WOTS-key submission before the readiness timeout (COPY.deposit.warnings.wotsReadinessTimeout /
// wotsReadinessTerminal). A skipped vault is dropped from payout signing + activation and can NEVER
// reach the activated view — so it's a hard dead-end for that vault, not a transient. Both variants
// share this "Vault N: WOTS key submission skipped" prefix; the capture group is the vault number.
const WOTS_SKIP_RX = /Vault\s+(\d+):\s*WOTS key submission skipped/i;

/**
 * Count DISTINCT per-vault WOTS-key-submission-skip banners on the progress view. Deduped by the vault
 * number so a banner matched via nested elements (or re-rendered) isn't double-counted; a copy drift
 * that breaks the "Vault N:" prefix simply yields 0 (we degrade to the normal budget wait, never a
 * false abort). Used by walkStepMachine to fail fast when every expected vault has been skipped.
 */
async function countWotsSkippedVaults(page: Page): Promise<number> {
  const banners = page.getByText(/WOTS key submission skipped/i);
  const count = await banners.count().catch(() => 0);
  const vaults = new Set<string>();
  for (let i = 0; i < count; i++) {
    const text = (
      await banners
        .nth(i)
        .innerText()
        .catch(() => "")
    ).replace(/\s+/g, " ");
    const match = text.match(WOTS_SKIP_RX);
    if (match) vaults.add(match[1]);
  }
  return vaults.size;
}

/**
 * Walk the 15-step signing machine to the activated vault. Two approval mechanisms run in parallel:
 * the event-driven `installPopupApprover` (for NEW wallet windows) and, each tick, an active
 * `sweepApprovals` pass over already-open windows — OKX reuses one approval window, so a later signing
 * prompt fires no `page` event and would otherwise never be clicked. This loop also drives the two
 * dapp-page gates the approver can't reach (Activate Vault + Skip) and follows the progress UI, logging
 * each transition, until the terminal view appears. `onStep` tags the recorder's HTTP fixtures.
 *
 * Returns this run's Pre-PegIn txid (captured once, as soon as the progress view links it) so the
 * finish-line check can target THIS run's vault card among a returning depositor's several.
 *
 * `expectedVaults` (1, or 2 for a split) gates the finish: the terminal "Go to Dashboard" view is
 * accepted only once we've driven that many activations. The app renders a TRANSIENT per-vault
 * "Go to Dashboard" (scoped to a single vault) that can appear after just one split vault activates —
 * so keying on that button alone could finish a split at 1/2. Counting the activations WE drove ties
 * completion to "both vaults activated", which is exactly what we did.
 */
async function walkStepMachine(
  page: Page,
  context: BrowserContext,
  log: (m: string) => void,
  expectedVaults: number,
  onStep: (step: string) => void,
): Promise<string | undefined> {
  const deadline = Date.now() + PEGIN_STEP_MACHINE_BUDGET_MS;
  let lastStep = "";
  // Per-appearance guards (NOT one-shot): a two-vault split has TWO activations, so the Activate modal
  // and the artifact-Skip callout can each appear twice. We click once per appearance and re-arm when
  // the control disappears — handling both vaults without double-clicking a single modal (which could
  // fire a duplicate ETH tx).
  let activateClickedThisModal = false;
  let skipClickedThisCallout = false;
  // Count the activations we've driven; the finish gate needs `expectedVaults` of them (see below).
  let activationCount = 0;
  let prePeginTxid: string | undefined;

  while (Date.now() < deadline) {
    // Finish only when the activated view is up AND we've driven every expected activation. The second
    // clause rejects the transient per-vault "Go to Dashboard" that can flash after just one split
    // vault activates, before the sibling is done. Single-vault (expectedVaults=1) is satisfied by the
    // one activation this fresh deposit always performs.
    if ((await activatedViewReached(page)) && activationCount >= expectedVaults)
      return prePeginTxid;

    // Fast-fail on a vault-provider readiness dead-end. If the VP never became ready for WOTS-key
    // submission, the app skips that vault and it can never activate — so the finish gate
    // (`activationCount >= expectedVaults`) becomes unreachable. Abort once there's no route left to a
    // full completion: at least one vault was skipped AND every non-skipped vault has already activated
    // (`activationCount >= expectedVaults - skippedVaults`). This covers both a fully-skipped deposit
    // (single vault, or all split vaults) and a PARTIAL split (one sibling skipped, the other activated)
    // — the latter would otherwise burn the entire multi-hour budget, the exact slow failure this guards.
    const skippedVaults = await countWotsSkippedVaults(page);
    if (skippedVaults > 0 && activationCount >= expectedVaults - skippedVaults)
      throw new Error(
        `Vault-provider readiness timeout: ${skippedVaults} of ${expectedVaults} vault(s) were skipped ` +
          `for WOTS-key submission and cannot activate` +
          `${activationCount > 0 ? ` (the other ${activationCount} activated)` : ""}. This is a ` +
          `vault-provider availability issue (not the CLI) — retry once the provider is healthy. The ` +
          `Pre-PegIn is already broadcast, so the deposit can be resumed later rather than re-pegged.`,
      );

    // Actively approve any reused wallet window (OKX) that the event approver can't see.
    await sweepApprovals(context, page, log);

    // Two dapp-page interactions the wallet pop-up approver can't perform, each re-armed per appearance.
    const activateVisible = await activateButton(page)
      .isVisible()
      .catch(() => false);
    if (activateVisible) {
      if (!activateClickedThisModal) {
        activateClickedThisModal = await handleActivateConfirmation(page, log);
        if (activateClickedThisModal) activationCount += 1;
      }
    } else {
      activateClickedThisModal = false;
    }

    const skipVisible = await page
      .getByRole("button", { name: SKIP_LABEL, exact: true })
      .first()
      .isVisible()
      .catch(() => false);
    if (skipVisible) {
      if (!skipClickedThisCallout)
        skipClickedThisCallout = await handleArtifactSkip(page, log);
    } else {
      skipClickedThisCallout = false;
    }

    // Capture the Pre-PegIn txid once, the first tick the progress view links it.
    if (!prePeginTxid) {
      prePeginTxid = await readPrePeginTxid(page);
      if (prePeginTxid)
        log(`Captured this run's Pre-PegIn txid: ${prePeginTxid}`);
    }

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
  prePeginTxid: string | undefined,
  expectedVaults: number,
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

  // Expand the collateral panel so the vault cards render.
  const cards = page.locator(VAULT_CARD_TESTID);
  if (
    !(await cards
      .first()
      .isVisible()
      .catch(() => false))
  ) {
    await options.click().catch(() => {});
    await cards
      .first()
      .waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS })
      .catch(() => {});
  }

  // Two-vault split: both fresh cards share THIS run's single (batched) Pre-PegIn txid, and each shows
  // its own split sub-amount (not the full requested amount), so the single-vault amount cross-check
  // below doesn't apply. "Both vaults activated" is already guaranteed upstream — walkStepMachine only
  // finishes once it has driven both activations — so this dashboard count is a SOFT secondary
  // confirmation: the indexer commonly lags a just-activated vault's tx-hash row, so a miss is logged
  // (not failed) rather than turning indexer lag into a false failure on a real-funds run.
  if (expectedVaults > 1) {
    // Both fresh split cards share this run's Pre-PegIn txid, but the indexer commonly lags a
    // just-activated vault's tx-hash row — so poll (bounded) for both cards to link the txid rather
    // than snapshotting once and warning on a transient 1/2.
    const matchingCards = () =>
      prePeginTxid
        ? cards
            .filter({ has: page.locator(`a[href*="${prePeginTxid}"]`) })
            .count()
            .catch(() => 0)
        : Promise.resolve(0);
    let matched = await matchingCards();
    const deadline = Date.now() + DASHBOARD_VAULT_TIMEOUT_MS;
    while (matched < expectedVaults && Date.now() < deadline) {
      await page.waitForTimeout(PEGIN_POLL_INTERVAL_MS);
      matched = await matchingCards();
    }
    const total = await cards.count().catch(() => 0);
    if (matched >= expectedVaults)
      log(
        `Dashboard shows ${matched} split vaults for this run (matched by Pre-PegIn txid ${prePeginTxid?.slice(0, 8)}…).`,
      );
    else
      log(
        `⚠️ Dashboard matched ${matched}/${expectedVaults} split vaults by Pre-PegIn txid within the wait (${total} cards total) — activation succeeded; the indexer may still be catching up to the fresh vaults' tx-hash rows.`,
      );
    return;
  }

  // A returning depositor's dashboard lists several vault cards, so `.first()` is not necessarily the
  // one this run created — matching the first card against the requested amount produced a false
  // mismatch warning against an older vault. Prefer THIS run's Pre-PegIn txid captured mid-flow: the
  // card links it in its "TX Hash" row (PeginTxHashRow, linkPrePegin default) as `<a href=".../tx/…">`.
  // But that row is indexer-sourced, and for a JUST-activated vault the indexer commonly lags the click
  // to the dashboard — the fresh card shows its amount (from activation state) before its tx-hash row
  // populates. So the amount match is the expected, immediately-authoritative identifier for a fresh
  // vault; the txid match engages once the indexer has caught up (e.g. an already-indexed vault). First
  // card is the last resort when neither is captured.
  const byTxid = prePeginTxid
    ? cards.filter({ has: page.locator(`a[href*="${prePeginTxid}"]`) }).first()
    : null;
  const byAmount = cards
    .filter({
      hasText: new RegExp(
        `${amountBtc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*sBTC`,
      ),
    })
    .first();

  let card = cards.first();
  let matchedBy = "first card (fallback)";
  if (byTxid && (await byTxid.isVisible().catch(() => false))) {
    card = byTxid;
    matchedBy = `Pre-PegIn txid ${prePeginTxid?.slice(0, 8)}…`;
  } else if (await byAmount.isVisible().catch(() => false)) {
    card = byAmount;
    matchedBy = `amount ${amountBtc}`;
  }

  const cardText = (await card.innerText().catch(() => ""))
    .replace(/\s+/g, " ")
    .trim();
  if (cardText.includes(amountBtc))
    log(
      `Dashboard shows this run's vault as collateral (${amountBtc} sBTC, matched by ${matchedBy}).`,
    );
  else
    log(
      `⚠️ Dashboard vault card did not clearly show "${amountBtc}" (matched by ${matchedBy}; card: "${cardText.slice(0, 120)}") — activation still succeeded.`,
    );
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
