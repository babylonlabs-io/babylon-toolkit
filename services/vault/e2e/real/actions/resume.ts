/**
 * The "resume" action: recover an interrupted peg-in from the dashboard's Pending Deposits UI and drive
 * it through to an activated vault.
 *
 * A real peg-in spans 30 min–2 hr and the app is built to survive interruption: once the Pre-PegIn is
 * broadcast the deposit is on-chain, and the dashboard resurfaces it under "Pending Deposits" with a
 * resume action (Submit WOTS Key → Sign Payouts → Activate) driven from live vault-provider state. This
 * action opens that pending card and hands off to the SAME `walkStepMachine` the `pegin` action uses —
 * the resume flow renders the IDENTICAL `DepositProgressView` stepper — so the walk, the Activate-Vault
 * gate, and the activated-view finish line are shared, not reimplemented.
 *
 * Two shapes:
 *   - default: resume an ALREADY-pending deposit (by `--txid`, else the first actionable card).
 *   - `--interrupt-fresh`: peg in a fresh deposit, interrupt it right after Pre-PegIn broadcast (reload
 *     the page to a cold state), then resume it from the dashboard — a fully self-contained run.
 *
 * Cold-resume specifics: unlike the happy path (which holds the vault root in memory), the dashboard
 * resume RE-DERIVES the vault root from the BTC wallet — a `deriveContextHash` approval dialog — to
 * recompute the WOTS keys and verify them against the on-chain hash. That dialog is the same one normal
 * peg-in step 1 (DERIVE_VAULT_SECRET) fires, so the shared pop-up approver already handles it; the
 * resume steps otherwise auto-fire on mount, so the only dapp-page interactions are the pending-card
 * click, the Activate gate, and "Go to Dashboard" — all owned by `walkStepMachine`.
 *
 * NEVER run `--interrupt-fresh` without an explicit go-ahead: it spends real signet BTC + Sepolia ETH.
 */
import type { Page } from "@playwright/test";

import {
  CONNECT_STATE_POLL_MS,
  CONNECT_STATE_TIMEOUT_MS,
  RESUME_ACTIONABLE_TIMEOUT_MS,
  RESUME_CARD_APPEAR_TIMEOUT_MS,
  RESUME_POLL_INTERVAL_MS,
  STEP_TIMEOUT_MS,
} from "../timing";

import { installPopupApprover, sweepApprovals } from "./approver";
import { fillDepositForm, startSigning } from "./pegin";
import { startRecording } from "./recording";
import {
  assertActivatedAndOnDashboard,
  walkStepMachine,
  walkUntilPrePeginBroadcast,
} from "./stepMachine";
import { type Action, type ActionContext } from "./types";
import { connectWallets } from "./walletConnect";

const DEPOSIT_BUTTON_TESTID = '[data-testid="deposit-button"]'; // connected-state signal (dashboard)
const CONNECT_BUTTON_TESTID = '[data-testid="connect-wallet-button"]'; // shown when disconnected
// PendingDepositSection's ExpandMenuButton — the pending list (and each card's resume CTA) lives behind
// it (aria-label="Pending deposit details"). The button is only rendered when a pending deposit exists,
// so its presence doubles as "there is something to resume".
const PENDING_EXPAND_RX = /pending deposit details/i;
// Added to services/vault/src for this action (see PendingDepositCard.tsx): the card root carries the
// deposit's Pre-PegIn txid (its tx-hash row links it), and the resume CTA renders ONLY once the deposit
// is actionable — so waiting for the CTA is waiting for vault-provider readiness.
const PENDING_CARD_TESTID = '[data-testid="pending-deposit-card"]';
const PENDING_RESUME_CTA_TESTID = '[data-testid="pending-deposit-resume-cta"]';

/** Normalize a Pre-PegIn txid flag to the bare lowercase hex the card's explorer href contains. */
function normalizeTxid(txid: string | undefined): string | undefined {
  const hex = txid?.trim().replace(/^0x/i, "").toLowerCase();
  return hex && /^[0-9a-f]{64}$/.test(hex) ? hex : undefined;
}

/**
 * After the interrupt reload, make sure the app is connected before we look for the pending card (the
 * pending list reads the connected ETH address). wagmi/AppKit usually auto-reconnects on reload (the
 * deposit button reappears with no pop-up); if instead the Connect button is shown, re-run the connect
 * flow. Neither appearing is left to the pending-card wait to surface a clearer error.
 */
async function ensureConnected(ctx: ActionContext): Promise<void> {
  const { page, context, log } = ctx;
  const deposit = page.locator(DEPOSIT_BUTTON_TESTID).first();
  const connect = page.locator(CONNECT_BUTTON_TESTID).first();
  const deadline = Date.now() + CONNECT_STATE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await deposit.isVisible().catch(() => false)) return; // auto-reconnected
    // Only click Connect once it's actually ENABLED. Right after the reload the app re-hydrates and the
    // Connect button renders visible-but-DISABLED for a beat while wagmi/AppKit auto-reconnects; clicking
    // that transient disabled button just times out (it detaches the instant the connected state swaps
    // in). Waiting instead lets the auto-reconnect win and the deposit button appear above.
    if (
      (await connect.isVisible().catch(() => false)) &&
      (await connect.isEnabled().catch(() => false))
    ) {
      log("Reconnecting wallets after the interrupt reload");
      await connectWallets(ctx);
      return;
    }
    await sweepApprovals(context, page, log);
    await page.waitForTimeout(CONNECT_STATE_POLL_MS);
  }
  log(
    "⚠️ After reload neither the connected state nor a Connect button appeared within the wait — proceeding; the pending-deposit wait will surface any connection issue.",
  );
}

/** Expand the Pending Deposits section if its cards aren't visible yet (the CTA lives behind it). */
async function ensurePendingExpanded(
  page: Page,
  log: (m: string) => void,
): Promise<void> {
  if (
    await page
      .locator(PENDING_CARD_TESTID)
      .first()
      .isVisible()
      .catch(() => false)
  )
    return;
  const expander = page
    .getByRole("button", { name: PENDING_EXPAND_RX })
    .first();
  if (await expander.isVisible().catch(() => false)) {
    log("Expanding the Pending Deposits section");
    await expander.click().catch(() => {});
  }
}

/** A concise snapshot of the target pending card's state, for a heads-up log while waiting. */
async function readPendingCardState(
  page: Page,
  txid: string | undefined,
): Promise<string> {
  const card = txid
    ? page
        .locator(PENDING_CARD_TESTID)
        .filter({ has: page.locator(`a[href*="${txid}"]`) })
        .first()
    : page.locator(PENDING_CARD_TESTID).first();
  return (await card.innerText().catch(() => ""))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

/**
 * Open the target pending deposit's resume flow: wait for the pending section, expand it, wait for the
 * deposit to become actionable (its resume CTA renders only then — gated on the VP reaching the next
 * step, which for a just-confirmed Pre-PegIn waits on signet block time), then click the CTA to open the
 * continuation view. Targets the `--txid` card when given (its tx-hash row links the Pre-PegIn), else the
 * first actionable card.
 */
async function openPendingDeposit(
  ctx: ActionContext,
  txid: string | undefined,
): Promise<void> {
  const { page, context, log } = ctx;

  // 1. Wait for the pending section (the expander is only rendered when a deposit is pending).
  const expander = page
    .getByRole("button", { name: PENDING_EXPAND_RX })
    .first();
  const appearDeadline = Date.now() + RESUME_CARD_APPEAR_TIMEOUT_MS;
  while (Date.now() < appearDeadline) {
    if (await expander.isVisible().catch(() => false)) break;
    await sweepApprovals(context, page, log);
    await page.waitForTimeout(RESUME_POLL_INTERVAL_MS);
  }
  if (!(await expander.isVisible().catch(() => false)))
    throw new Error(
      "resume: no pending deposit found on the dashboard to resume. Peg in and interrupt one first (or re-run with --interrupt-fresh), or resume with an ETH account that has an in-flight deposit.",
    );

  await ensurePendingExpanded(page, log);

  // 2. The resume CTA — scoped to the --txid card when given, else the first actionable card.
  const cta = txid
    ? page
        .locator(PENDING_CARD_TESTID)
        .filter({ has: page.locator(`a[href*="${txid}"]`) })
        .locator(PENDING_RESUME_CTA_TESTID)
        .first()
    : page.locator(PENDING_RESUME_CTA_TESTID).first();

  // 3. Wait for it to become actionable — can be long (VP must ingest the confirmed Pre-PegIn).
  log(
    txid
      ? `Waiting for pending deposit ${txid.slice(0, 8)}… to become resumable (vault-provider readiness)…`
      : "Waiting for a pending deposit to become resumable (vault-provider readiness)…",
  );
  const actionableDeadline = Date.now() + RESUME_ACTIONABLE_TIMEOUT_MS;
  let lastState = "";
  while (Date.now() < actionableDeadline) {
    await ensurePendingExpanded(page, log);
    if (await cta.isVisible().catch(() => false)) break;
    const state = await readPendingCardState(page, txid);
    if (state && state !== lastState) {
      lastState = state;
      log(`Pending deposit → ${state}`);
    }
    await sweepApprovals(context, page, log);
    await page.waitForTimeout(RESUME_POLL_INTERVAL_MS);
  }
  if (!(await cta.isVisible().catch(() => false)))
    throw new Error(
      "resume: the pending deposit never became resumable within the budget — the vault provider may not have ingested the confirmed Pre-PegIn (signet confirmation delay / VP availability), or the deposit hit a terminal state. Retry once the card shows a resume action.",
    );

  const label = (await cta.innerText().catch(() => ""))
    .replace(/\s+/g, " ")
    .trim();
  log(`Resuming pending deposit — clicking "${label || "resume"}"`);
  await cta.click({ timeout: STEP_TIMEOUT_MS });
}

/**
 * `--interrupt-fresh`: peg in a fresh deposit only as far as the Pre-PegIn broadcast, then reload the
 * page to a cold state so the deposit must be resumed from the dashboard (the realistic "closed the tab,
 * came back later" scenario). Reuses the pegin form + signing helpers and the shared broadcast walk.
 */
async function peginUntilInterrupt(
  ctx: ActionContext,
  onStep: (step: string) => void,
): Promise<void> {
  const { page, context, log } = ctx;
  const amountBtc = ctx.config.peginAmountBtc?.trim();
  if (!amountBtc)
    throw new Error(
      "resume --interrupt-fresh: no deposit amount resolved — the minimum-deposit fetch failed and no --amount was given. Re-run with --amount=<btc>, or against a reachable network.",
    );
  const provider = ctx.config.peginProvider?.trim() || undefined;
  const split = ctx.config.split ?? false;

  log(
    "--interrupt-fresh: pegging in a fresh deposit, to interrupt after Pre-PegIn broadcast and resume it",
  );
  onStep("deposit-form");
  await fillDepositForm(page, log, amountBtc, provider, split);

  onStep("sign-transaction");
  await startSigning(page, log);

  onStep("until-broadcast");
  const txid = await walkUntilPrePeginBroadcast(page, context, log, onStep);

  log(
    `Interrupting after Pre-PegIn broadcast (txid ${txid}) — reloading the page to a cold state.`,
  );
  onStep("reload");
  await page.reload({ waitUntil: "domcontentloaded" });
  await ensureConnected(ctx);
}

/**
 * Resume the pending deposit through to activation: open its resume flow, then hand off to the shared
 * step machine (WOTS → Sign → Activate → Go to Dashboard) and the dashboard collateral cross-check.
 */
async function runResumeFlow(
  ctx: ActionContext,
  onStep: (step: string) => void,
): Promise<void> {
  const { page, context, log } = ctx;

  onStep("open-pending-deposit");
  await openPendingDeposit(ctx, normalizeTxid(ctx.config.resumeTxid));

  onStep("resume-step-machine");
  const expectedVaults = ctx.config.split ? 2 : 1;
  const prePeginTxid = await walkStepMachine(
    page,
    context,
    log,
    expectedVaults,
    onStep,
  );

  onStep("finish");
  // The resume flow doesn't always know the original deposit amount (a plain resume of a pre-existing
  // deposit), so the dashboard cross-check runs by Pre-PegIn txid; --interrupt-fresh does pass the amount.
  await assertActivatedAndOnDashboard(
    page,
    log,
    ctx.config.peginAmountBtc,
    prePeginTxid,
    expectedVaults,
  );
  log(
    "✅ Resume complete: the interrupted deposit reached an activated vault on the dashboard.",
  );
}

export const resumeAction: Action = {
  id: "resume",
  async run(ctx: ActionContext): Promise<void> {
    const { page, context, log, artifactsDir } = ctx;

    // Approver stays installed for the whole run (auto-approves every wallet pop-up, incl. the
    // cold-resume `deriveContextHash` vault-root dialog).
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
      if (ctx.config.interruptFresh)
        await peginUntilInterrupt(ctx, (step) => {
          currentStep = step;
        });
      await runResumeFlow(ctx, (step) => {
        currentStep = step;
      });
    } finally {
      await recorder.stop();
      context.off("page", handler);
    }
  },
};
