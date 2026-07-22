/**
 * The shared peg-in signing step-machine + activated-view finish line, driven purely by AWAITING UI
 * transitions (the `role="progressbar"` and each active step's `aria-label="Step N active"`), never
 * fixed sleeps. Extracted from the `pegin` action so both `pegin` (form → sign → walk) and `resume`
 * (dashboard pending card → walk) share ONE implementation of the 15-step `DepositProgressView` walk,
 * the Activate-Vault / artifact-Skip dapp gates, the transient-tx Retry gate, the WOTS-skip fast-fail,
 * and the dashboard collateral cross-check.
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
const VAULT_OPTIONS_RX = /vault options/i; // CollateralSection ExpandMenuButton aria-label ("[BTC ]Vault options")
const VAULT_CARD_TESTID = '[data-testid="vault-card"]'; // CollateralVaultItem VaultCardShell (stable testid)

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
 * Finish line: click "Go to Dashboard", then best-effort confirm the vault landed as collateral. The
 * activated view is the definitive success signal (we're only here because its "Go to Dashboard"
 * button appeared); the dashboard card is a secondary check, so a copy/layout drift on the dashboard
 * is logged as a warning rather than hanging or failing an otherwise-successful peg-in.
 *
 * `amountBtc` may be undefined (the resume flow doesn't know the original deposit amount) — the
 * amount cross-check is then skipped and the txid / first-card path is used instead.
 */
export async function assertActivatedAndOnDashboard(
  page: Page,
  log: (m: string) => void,
  amountBtc: string | undefined,
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
  const byAmount = amountBtc
    ? cards
        .filter({
          hasText: new RegExp(
            `${amountBtc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*sBTC`,
          ),
        })
        .first()
    : null;

  let card = cards.first();
  let matchedBy = "first card (fallback)";
  if (byTxid && (await byTxid.isVisible().catch(() => false))) {
    card = byTxid;
    matchedBy = `Pre-PegIn txid ${prePeginTxid?.slice(0, 8)}…`;
  } else if (byAmount && (await byAmount.isVisible().catch(() => false))) {
    card = byAmount;
    matchedBy = `amount ${amountBtc}`;
  }

  const cardText = (await card.innerText().catch(() => ""))
    .replace(/\s+/g, " ")
    .trim();
  // With no known amount (resume), reaching the activated view + a rendered collateral card is the
  // success signal; the amount-substring assertion only applies when the caller passed an amount.
  if (!amountBtc)
    log(
      `Dashboard shows the resumed vault as collateral (matched by ${matchedBy}).`,
    );
  else if (cardText.includes(amountBtc))
    log(
      `Dashboard shows this run's vault as collateral (${amountBtc} sBTC, matched by ${matchedBy}).`,
    );
  else
    log(
      `⚠️ Dashboard vault card did not clearly show "${amountBtc}" (matched by ${matchedBy}; card: "${cardText.slice(0, 120)}") — activation still succeeded.`,
    );
}
