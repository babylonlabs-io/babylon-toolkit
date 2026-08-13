/**
 * The shared peg-in signing step-machine + activated-view finish line, driven purely by AWAITING UI
 * transitions (the `role="progressbar"` and each active step's `aria-label="Step N active"`), never
 * fixed sleeps. Extracted from the `pegin` action so both `pegin` (form → sign → walk) and `resume`
 * (/vaults pending row → walk) share ONE implementation of the 15-step `DepositProgressView` walk,
 * the Activate-Vault / artifact-Skip dapp gates, the transient-tx Retry gate, the WOTS-skip fast-fail,
 * and the /vaults collateral cross-check.
 *
 * The resume flow renders the IDENTICAL `DepositProgressView` stepper as the initial deposit, so the
 * walk works unchanged for both. The artifact-Skip gate is re-armed per appearance and simply never
 * fires in resume (that flow shows no Skip button) — it is optional, never required.
 *
 * No product/SDK code is reimplemented here; this only drives the UI. Wallet pop-ups (BTC signing,
 * the `deriveContextHash` vault-root dialog, MetaMask txs) are auto-approved by the shared pop-up
 * approver — the event-driven `installPopupApprover` plus the per-tick `sweepApprovals` this walk runs.
 */
import type { BrowserContext, Locator, Page } from "@playwright/test";

import {
  DASHBOARD_VAULT_TIMEOUT_MS,
  PEGIN_POLL_INTERVAL_MS,
  PEGIN_STEP_MACHINE_BUDGET_MS,
  PEGIN_TX_FAILURE_RETRY_LIMIT,
  STEP_TIMEOUT_MS,
} from "../timing";

import { sweepApprovals } from "./approver";
import { goToSection } from "./navigation";
import { firstByTestid } from "./selectors";

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
// The DepositProgressView's recoverable-error CTA: the fluid submit relabels to "Retry" (and calls
// `onRetry`) whenever a step tx fails with a retryable error (COPY.deposit.progress.buttons.retry). It's
// only rendered in that error state — during signing the CTA is "Sign Transaction"/processing/"Done" —
// so its visible text is a safe, state-specific target (mirrors how the Activate/Skip gates are matched).
const RETRY_BUTTON_RX = /^retry$/i; // COPY.deposit.progress.buttons.retry
function retryButton(page: Page): Locator {
  return page.getByRole("button", { name: RETRY_BUTTON_RX }).first();
}
// Finish-line matchers are tolerant regexes, NOT exact strings: the deployed build's copy can drift
// from local source (e.g. the heading renders "Vault activated" on devnet vs "BTC Vault activated" in
// copy.ts), and we key on the stable actionable control (the "Go to Dashboard" button) rather than the
// heading text so a wording tweak can't strand the run at the activated screen.
const GO_TO_DASHBOARD_RX = /go to dashboard/i; // COPY.deposit.vaultActivatedSuccess.goToDashboard
// One active-vault row on /vaults, keyed by on-chain vaultId (VaultsActiveSection ActiveVaultRow).
// v3 renders these inline — the v2 collateral expander they used to hide behind is gone.
const VAULT_ROW_SELECTOR = '[data-testid^="vault-row-"]';
// The deposit/resume overlay's root (V3ModalShell → core-ui FullScreenDialog). The page behind it stays
// mounted, so anything read "from the progress view" must be scoped to this — see readPrePeginTxid.
const DEPOSIT_DIALOG_SELECTOR = ".bbn-dialog-fullscreen";

/**
 * How many active-vault rows /vaults is currently showing. Callers snapshot this BEFORE starting a
 * deposit so the finish line can assert the count rose by the number of vaults the run creates — see
 * assertActivatedAndOnDashboard's split branch. Assumes the page is already on /vaults.
 */
export function countActiveVaultRows(page: Page): Promise<number> {
  return page
    .locator(VAULT_ROW_SELECTOR)
    .count()
    .catch(() => 0);
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
 * the flow (well before the VP broadcasts the peg-in), so the first BTC txid to appear inside the
 * deposit dialog is this run's Pre-PegIn. Used to pin the /vaults cross-check to THIS run's vault — a
 * returning depositor's list holds several. Scans hrefs Node-side (no page-context function) and skips
 * ETH links: an ETH `/tx/0x…` hash never matches the 64-hex-no-0x BTC pattern.
 *
 * SCOPED TO THE DIALOG, deliberately. The deposit flow is a full-screen overlay (V3ModalShell →
 * core-ui FullScreenDialog) and /vaults stays mounted behind it, so a page-wide scan reads the FIRST
 * active-vault row's hash cell — an unrelated, already-activated deposit — the instant the depositor
 * holds any vault. That mis-capture is silent: the single-vault finish line just falls back to its
 * amount match, and the split branch (txid-only) reports "0/N matched" and blames indexer lag. Same
 * hazard resume.ts documents when it prefers a known txid over the read one.
 */
async function readPrePeginTxid(page: Page): Promise<string | undefined> {
  const links = page.locator(`${DEPOSIT_DIALOG_SELECTOR} a[href*="/tx/"]`);
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
export async function walkStepMachine(
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
  // A recoverable "Transaction failed → Retry" state (e.g. the intermittent public-Sepolia RPC
  // gas-estimation flake that nulls a tx's `gasLimit`). Re-armed per appearance like the gates above,
  // and capped at PEGIN_TX_FAILURE_RETRY_LIMIT total so a genuinely-failing tx aborts instead of looping.
  let retryClickedThisCallout = false;
  let txRetryCount = 0;
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

    // Recover from a transient, app-retryable step-tx failure (e.g. the public-Sepolia RPC returning a
    // null gasLimit on an activation tx): the progress view shows a "Transaction failed" callout with a
    // Retry button that a human would just click. Click it — re-armed per appearance, capped at
    // PEGIN_TX_FAILURE_RETRY_LIMIT so a persistently-failing tx aborts with the callout instead of
    // spinning to the budget deadline. sweepApprovals (above) + the event approver confirm the wallet
    // pop-up the retried tx re-opens. This does NOT touch `activationCount`: Retry re-runs the pending tx
    // on the progress view, not the Activate modal, so a recovered activation stays counted exactly once.
    const retryVisible = await retryButton(page)
      .isVisible()
      .catch(() => false);
    if (retryVisible) {
      if (!retryClickedThisCallout) {
        if (txRetryCount >= PEGIN_TX_FAILURE_RETRY_LIMIT)
          throw new Error(
            `A step-machine transaction kept failing after ${PEGIN_TX_FAILURE_RETRY_LIMIT} retries — see the "Transaction failed" callout (a persistent RPC/gas-estimation or contract error, not a transient flake). trace.zip + the failure screenshot are captured.`,
          );
        txRetryCount += 1;
        log(
          `⚠️ Step-machine transaction failed — clicking Retry (${txRetryCount}/${PEGIN_TX_FAILURE_RETRY_LIMIT}) to recover from a transient tx/RPC failure`,
        );
        await retryButton(page)
          .click({ timeout: STEP_TIMEOUT_MS })
          .catch(() => {});
        retryClickedThisCallout = true;
      }
    } else {
      retryClickedThisCallout = false;
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

/** Ticks (× PEGIN_POLL_INTERVAL_MS) to keep sweeping pop-ups after the Pre-PegIn txid appears, so the
 *  broadcast call lands before an interrupt reload. */
const BROADCAST_SETTLE_TICKS = 3;

/**
 * Drive the signing sequence only up to the Pre-PegIn broadcast and return its txid. Used by the
 * `resume` action's `--interrupt-fresh` path to reach an on-chain, resumable deposit, which it then
 * reloads (cold) to resume from the dashboard. Before broadcast the only wallet pop-ups are BTC signing
 * (derive secret / sign PSBT / sign PoP) and the SUBMIT_PEGIN ETH tx — all handled by the approver +
 * this loop's `sweepApprovals`; no Activate/Skip/Retry dapp gates fire yet. The Pre-PegIn txid link
 * appears only once the app has signed AND broadcast it, so capturing it is the post-broadcast signal;
 * we keep sweeping for a short settle afterwards so any final broadcast pop-up is confirmed before the
 * caller reloads.
 */
export async function walkUntilPrePeginBroadcast(
  page: Page,
  context: BrowserContext,
  log: (m: string) => void,
  onStep: (step: string) => void,
): Promise<string> {
  const deadline = Date.now() + PEGIN_STEP_MACHINE_BUDGET_MS;
  let lastStep = "";
  while (Date.now() < deadline) {
    await sweepApprovals(context, page, log);

    const txid = await readPrePeginTxid(page);
    if (txid) {
      log(`Pre-PegIn broadcast — captured txid ${txid}`);
      // Short settle: keep confirming pop-ups for a few ticks so the broadcast call fully lands before
      // the caller reloads the page (reloading mid-broadcast could drop the mempool submission).
      for (let i = 0; i < BROADCAST_SETTLE_TICKS; i++) {
        await sweepApprovals(context, page, log);
        await page.waitForTimeout(PEGIN_POLL_INTERVAL_MS);
      }
      return txid;
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
    "Pre-PegIn was not broadcast (no BTC txid linked in the progress view) within the step-machine budget — see trace.zip",
  );
}

/**
 * Finish line: click "Go to Dashboard", navigate to /vaults, then best-effort confirm the vault landed
 * as collateral. The activated view is the definitive success signal (we're only here because its "Go
 * to Dashboard" button appeared); the vault row is a secondary check, so a copy/layout drift on
 * /vaults is logged as a warning rather than hanging or failing an otherwise-successful peg-in.
 *
 * "Go to Dashboard" lands on the overview (`/`), which in v3 shows position totals but no per-vault
 * rows — the rows live on /vaults, hence the explicit navigation.
 *
 * `amountBtc` may be undefined (the resume flow doesn't know the original deposit amount) — the
 * amount cross-check is then skipped and the txid / first-row path is used instead.
 *
 * `baselineRowCount` is the active-row count from BEFORE this run's deposit (countActiveVaultRows on
 * /vaults). The split branch needs it; see there for why a txid match cannot work.
 */
export async function assertActivatedAndOnDashboard(
  page: Page,
  log: (m: string) => void,
  amountBtc: string | undefined,
  prePeginTxid: string | undefined,
  expectedVaults: number,
  baselineRowCount: number | undefined,
): Promise<void> {
  log("✅ Activated view reached — clicking Go to Dashboard");
  await page
    .getByRole("button", { name: GO_TO_DASHBOARD_RX })
    .first()
    .click({ timeout: STEP_TIMEOUT_MS });

  // The cross-check is secondary — a navigation hiccup must not fail an otherwise-successful peg-in.
  const navigated = await goToSection(page, "vaults", log)
    .then(() => true)
    .catch(() => false);
  if (!navigated) {
    log(
      "⚠️ Could not navigate to /vaults after activation — activation succeeded; skipping the vault-row cross-check.",
    );
    return;
  }

  // v3 renders active vaults as always-visible rows (no expander to open). Bounded wait so a slow
  // indexer can never hang the run.
  const rows = page.locator(VAULT_ROW_SELECTOR);
  const rowsShown = await rows
    .first()
    .waitFor({ state: "visible", timeout: DASHBOARD_VAULT_TIMEOUT_MS })
    .then(() => true)
    .catch(() => false);
  if (!rowsShown) {
    log(
      "⚠️ No active-vault row rendered on /vaults within the wait — activation succeeded; skipping the row cross-check.",
    );
    return;
  }

  // Two-vault split: identify this run's vaults by the ROW COUNT RISING, not by txid.
  //
  // A txid match cannot work here. An active row renders `peginTxHash ?? prePeginTxHash`
  // (VaultsActiveSection) — i.e. the PEG-IN transaction, which is a different tx from the Pre-PegIn we
  // capture mid-flow. The two only coincide in the narrow window before the indexer populates
  // `peginTxHash`, so the match is guaranteed to fail once indexing lands. Nor can the single-vault
  // amount match substitute: each split row shows its own allocated sub-amount (e.g. 26/74 of the
  // deposit), which the harness never computes — the app does.
  //
  // The count delta is indexer-independent and checks the thing the split actually claims: N more
  // vaults exist than before. Still SOFT — "both vaults activated" is already guaranteed upstream
  // (walkStepMachine only finishes once it has driven every activation), so this is a secondary
  // confirmation and a miss must not fail an otherwise-successful real-funds run.
  if (expectedVaults > 1) {
    if (baselineRowCount === undefined) {
      log(
        `⚠️ No pre-deposit row count was captured, so the ${expectedVaults}-vault split cross-check was skipped — activation still succeeded.`,
      );
      return;
    }
    const target = baselineRowCount + expectedVaults;
    let total = await rows.count().catch(() => 0);
    const deadline = Date.now() + DASHBOARD_VAULT_TIMEOUT_MS;
    while (total < target && Date.now() < deadline) {
      await page.waitForTimeout(PEGIN_POLL_INTERVAL_MS);
      total = await rows.count().catch(() => 0);
    }
    if (total >= target)
      log(
        `/vaults shows ${total} active vaults, up ${total - baselineRowCount} from ${baselineRowCount} before this run — the ${expectedVaults}-vault split landed.`,
      );
    else
      log(
        `⚠️ /vaults shows ${total} active vaults, up ${total - baselineRowCount} from ${baselineRowCount} — expected ${expectedVaults} more within the wait. Activation succeeded; the indexer may still be catching up.`,
      );
    return;
  }

  // A returning depositor's /vaults lists several vault rows, so `.first()` is not necessarily the one
  // this run created — matching the first row against the requested amount produced a false mismatch
  // warning against an older vault. Prefer THIS run's Pre-PegIn txid captured mid-flow: the row links
  // it in its transaction-hash cell (CopyableHash) as `<a href=".../tx/…">`. But that cell is
  // indexer-sourced, and for a JUST-activated vault the indexer commonly lags the click to the
  // dashboard — the fresh row shows its amount (from activation state) before its hash cell populates.
  // So the amount match is the expected, immediately-authoritative identifier for a fresh vault; the
  // txid match engages once the indexer has caught up (e.g. an already-indexed vault). First row is the
  // last resort when neither is captured.
  const byTxid = prePeginTxid
    ? rows.filter({ has: page.locator(`a[href*="${prePeginTxid}"]`) }).first()
    : null;
  const byAmount = amountBtc
    ? rows
        .filter({
          hasText: new RegExp(
            `${amountBtc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*sBTC`,
          ),
        })
        .first()
    : null;

  let row = rows.first();
  let matchedBy = "first row (fallback)";
  if (byTxid && (await byTxid.isVisible().catch(() => false))) {
    row = byTxid;
    matchedBy = `Pre-PegIn txid ${prePeginTxid?.slice(0, 8)}…`;
  } else if (byAmount && (await byAmount.isVisible().catch(() => false))) {
    row = byAmount;
    matchedBy = `amount ${amountBtc}`;
  }

  const rowText = (await row.innerText().catch(() => ""))
    .replace(/\s+/g, " ")
    .trim();
  // With no known amount (resume), reaching the activated view + a rendered vault row is the success
  // signal; the amount-substring assertion only applies when the caller passed an amount.
  if (!amountBtc)
    log(
      `/vaults shows the resumed vault as collateral (matched by ${matchedBy}).`,
    );
  else if (rowText.includes(amountBtc))
    log(
      `/vaults shows this run's vault as collateral (${amountBtc} sBTC, matched by ${matchedBy}).`,
    );
  else
    log(
      `⚠️ The /vaults row did not clearly show "${amountBtc}" (matched by ${matchedBy}; row: "${rowText.slice(0, 120)}") — activation still succeeded.`,
    );
}
