/**
 * The "resume" action: recover an interrupted peg-in from the /vaults pending-deposits list and drive
 * it through to an activated vault.
 *
 * A real peg-in spans 30 min–2 hr and the app is built to survive interruption: once the Pre-PegIn is
 * broadcast the deposit is on-chain, and /vaults resurfaces it as a pending row with a resume action
 * (Submit WOTS Key → Sign Payouts → Activate) driven from live vault-provider state. This action opens
 * that pending row and hands off to the SAME `walkStepMachine` the `pegin` action uses — the resume
 * flow renders the IDENTICAL `DepositProgressView` stepper — so the walk, the Activate-Vault gate, and
 * the activated-view finish line are shared, not reimplemented.
 *
 * Two shapes:
 *   - default: resume an ALREADY-pending deposit (by `--txid`, else the first actionable row).
 *   - `--interrupt-fresh`: peg in a fresh deposit, interrupt it right after Pre-PegIn broadcast (reload
 *     the page to a cold state), then resume it from /vaults — a fully self-contained run.
 *
 * Cold-resume specifics: unlike the happy path (which holds the vault root in memory), the resume
 * RE-DERIVES the vault root from the BTC wallet — a `deriveContextHash` approval dialog — to recompute
 * the WOTS keys and verify them against the on-chain hash. That dialog is the same one normal peg-in
 * step 1 (DERIVE_VAULT_SECRET) fires, so the shared pop-up approver already handles it; the resume steps
 * otherwise auto-fire on mount, so the only dapp-page interactions are the pending-row CTA click, the
 * Activate gate, and "Go to Dashboard" — all owned by `walkStepMachine`.
 *
 * v3 note (markdown/e2e-v3/06-resume.md): pending deposits are flat, always-visible rows — the v2
 * expander they used to hide behind is gone, so there is nothing to expand.
 *
 * NEVER run `--interrupt-fresh` without an explicit go-ahead: it spends real signet BTC + Sepolia ETH.
 */
import type { Page } from "@playwright/test";

import { fetchActiveVaultCount } from "../borrowParams";
import {
  CONNECT_STATE_POLL_MS,
  CONNECT_STATE_TIMEOUT_MS,
  RESUME_ACTIONABLE_TIMEOUT_MS,
  RESUME_POLL_INTERVAL_MS,
  RESUME_ROW_APPEAR_TIMEOUT_MS,
  STEP_TIMEOUT_MS,
} from "../timing";

import { installPopupApprover, sweepApprovals } from "./approver";
import { goToSection } from "./navigation";
import { fillDepositForm, startSigning } from "./pegin";
import { startRecording } from "./recording";
import {
  assertActivatedAndOnDashboard,
  assertVaultCountRose,
  walkStepMachine,
  walkUntilPrePeginBroadcast,
} from "./stepMachine";
import { type Action, type ActionContext } from "./types";
import { connectWallets, WALLET_MENU_TRIGGER_TESTID } from "./walletConnect";

const CONNECT_BUTTON_TESTID = '[data-testid="connect-wallet-button"]'; // shown when disconnected
// VaultsLifecycleSections' PendingRow: the row carries the deposit's Pre-PegIn txid (its hash cell
// links it), and it is rendered only while a deposit is pending — so its presence doubles as "there is
// something to resume". The resume CTA inside renders ONLY once the deposit is actionable, so waiting
// for the CTA is waiting for vault-provider readiness.
const PENDING_ROW_TESTID = '[data-testid="pending-deposit-row"]';
const PENDING_RESUME_CTA_TESTID = '[data-testid="pending-deposit-resume-cta"]';

/** Normalize a Pre-PegIn txid flag to the bare lowercase hex the row's explorer href contains. */
function normalizeTxid(txid: string | undefined): string | undefined {
  const hex = txid?.trim().replace(/^0x/i, "").toLowerCase();
  return hex && /^[0-9a-f]{64}$/.test(hex) ? hex : undefined;
}

/**
 * After the interrupt reload, make sure the app is connected before we look for the pending row (the
 * pending list reads the connected ETH address). wagmi/AppKit usually auto-reconnects on reload (the
 * header wallet menu reappears with no pop-up); if instead the Connect button is shown, re-run the
 * connect flow. Neither appearing is left to the pending-row wait to surface a clearer error.
 */
async function ensureConnected(ctx: ActionContext): Promise<void> {
  const { page, context, log } = ctx;
  const walletMenu = page.locator(WALLET_MENU_TRIGGER_TESTID).first();
  const connect = page.locator(CONNECT_BUTTON_TESTID).first();
  const deadline = Date.now() + CONNECT_STATE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await walletMenu.isVisible().catch(() => false)) return; // auto-reconnected
    // Only click Connect once it's actually ENABLED. Right after the reload the app re-hydrates and the
    // Connect button renders visible-but-DISABLED for a beat while wagmi/AppKit auto-reconnects; clicking
    // that transient disabled button just times out (it detaches the instant the connected state swaps
    // in). Waiting instead lets the auto-reconnect win and the wallet menu appear above.
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

/** A concise snapshot of the target pending row's state, for a heads-up log while waiting. */
async function readPendingRowState(
  page: Page,
  txid: string | undefined,
): Promise<string> {
  const row = txid
    ? page
        .locator(PENDING_ROW_TESTID)
        .filter({ has: page.locator(`a[href*="${txid}"]`) })
        .first()
    : page.locator(PENDING_ROW_TESTID).first();
  return (await row.innerText().catch(() => ""))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

/**
 * Open the target pending deposit's resume flow: navigate to /vaults, wait for a pending row, wait for
 * the deposit to become actionable (its resume CTA renders only then — gated on the VP reaching the next
 * step, which for a just-confirmed Pre-PegIn waits on signet block time), then click the CTA to open the
 * continuation view. Targets the `--txid` row when given (its hash cell links the Pre-PegIn), else the
 * first actionable row.
 */
async function openPendingDeposit(
  ctx: ActionContext,
  txid: string | undefined,
): Promise<void> {
  const { page, context, log } = ctx;

  await goToSection(page, "vaults", log);

  // 1. Wait for a pending row (rendered only while a deposit is in flight).
  const pendingRow = page.locator(PENDING_ROW_TESTID).first();
  const appearDeadline = Date.now() + RESUME_ROW_APPEAR_TIMEOUT_MS;
  while (Date.now() < appearDeadline) {
    if (await pendingRow.isVisible().catch(() => false)) break;
    await sweepApprovals(context, page, log);
    await page.waitForTimeout(RESUME_POLL_INTERVAL_MS);
  }
  if (!(await pendingRow.isVisible().catch(() => false)))
    throw new Error(
      "resume: no pending deposit found on /vaults to resume. Peg in and interrupt one first (or re-run with --interrupt-fresh), or resume with an ETH account that has an in-flight deposit.",
    );

  // 2. The resume CTA. v3 gives EVERY pending deposit its own row and its own CTA — including each half
  //    of a split, which is why a two-vault batch shows two rows sharing one Pre-PegIn hash. Clicking
  //    either one resumes the WHOLE batch: the row's action routes to `onOpenDetails`, which expands the
  //    deposit through `getBatchSiblings` (every activity sharing that Pre-PegIn) and opens the
  //    multistepper over all of them. So one row-scoped locator covers both shapes — there is no
  //    group-level CTA in v3 (the v2 `role="button"` batch wrapper is gone).
  const txidHref = txid ? `a[href*="${txid}"]` : undefined;
  const cta = txidHref
    ? page
        .locator(PENDING_ROW_TESTID)
        .filter({ has: page.locator(txidHref) })
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
    if (await cta.isVisible().catch(() => false)) break;
    const state = await readPendingRowState(page, txid);
    if (state && state !== lastState) {
      lastState = state;
      log(`Pending deposit → ${state}`);
    }
    await sweepApprovals(context, page, log);
    await page.waitForTimeout(RESUME_POLL_INTERVAL_MS);
  }
  if (!(await cta.isVisible().catch(() => false)))
    throw new Error(
      "resume: the pending deposit never became resumable within the budget — the vault provider may not have ingested the confirmed Pre-PegIn (signet confirmation delay / VP availability), or the deposit hit a terminal state. Retry once the row shows a resume action.",
    );

  const label = (await cta.innerText().catch(() => ""))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
  log(`Resuming pending deposit — clicking "${label || "resume"}"`);
  // A plain <button> in the row's action slot, rendered only while the deposit is actionable — so the
  // standard actionability checks apply and are worth keeping (v2 needed `force` to punch through the
  // batch group's role=button wrapper, which v3 no longer has).
  await cta.click({ timeout: STEP_TIMEOUT_MS });
}

/**
 * `--interrupt-fresh`: peg in a fresh deposit only as far as the Pre-PegIn broadcast, then reload the
 * page to a cold state so the deposit must be resumed from /vaults (the realistic "closed the tab,
 * came back later" scenario). Reuses the pegin form + signing helpers and the shared broadcast walk.
 *
 * Returns the fresh Pre-PegIn txid so the caller can target exactly THIS deposit when resuming — without
 * it the resume would fall back to the first actionable pending row and could pick up an unrelated
 * deposit (/vaults commonly lists several in flight).
 */
async function peginUntilInterrupt(
  ctx: ActionContext,
  onStep: (step: string) => void,
): Promise<string> {
  const { page, context, log } = ctx;
  const amountBtc = ctx.config.peginAmountBtc?.trim();
  if (!amountBtc)
    throw new Error(
      "resume --interrupt-fresh: no deposit amount resolved — the minimum-deposit fetch failed and no --amount was given. Re-run with --amount=<btc>, or against a reachable network.",
    );
  const provider = ctx.config.peginProvider?.trim() || undefined;
  const split = ctx.config.split ?? false;

  log(
    "Pegging in a fresh deposit, to interrupt right after the Pre-PegIn broadcast",
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
  return txid;
}

/**
 * Resume the pending deposit through to activation: open its resume flow, then hand off to the shared
 * step machine (WOTS → Sign → Activate → Go to Dashboard) and the /vaults collateral cross-check.
 *
 * `targetTxid` (the just-created deposit's Pre-PegIn txid under `--interrupt-fresh`) takes precedence
 * over `--txid`; when neither is set, `openPendingDeposit` falls back to the first actionable row.
 */
async function runResumeFlow(
  ctx: ActionContext,
  onStep: (step: string) => void,
  targetTxid?: string,
): Promise<void> {
  const { page, context, log } = ctx;

  // The deposit we're resuming (a fresh interrupt txid wins over --txid). Used BOTH to target the row
  // AND as the ground-truth Pre-PegIn for the /vaults cross-check: walkStepMachine re-reads the first
  // on-page /tx link, which in a resume is the page *behind* the continuation view — a DIFFERENT
  // deposit — so we prefer this known txid and only fall back to the read one (first-actionable resume).
  const knownTxid = normalizeTxid(targetTxid ?? ctx.config.resumeTxid);

  // Snapshot the on-chain vault count BEFORE resuming — the post-condition's baseline. Read from
  // `getPosition`, never the UI: /vaults renders optimistic rows for the vaults this resume activates.
  const vaultsBefore = await fetchActiveVaultCount(
    ctx.config.network,
    ctx.eth.address,
  );

  onStep("open-pending-deposit");
  await openPendingDeposit(ctx, knownTxid);

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
  // deposit), so this display check falls back to the Pre-PegIn txid; --interrupt-fresh does pass the
  // amount. Either way it only confirms the row rendered — the on-chain assert below is the real one.
  await assertActivatedAndOnDashboard(
    page,
    log,
    ctx.config.peginAmountBtc,
    knownTxid ?? prePeginTxid,
  );

  await assertVaultCountRose(ctx, vaultsBefore, expectedVaults);
  log(
    "✅ Resume complete: the interrupted deposit reached an activated vault on /vaults.",
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
      // --interrupt-fresh / --interrupt-only peg in a new deposit and return its Pre-PegIn txid; fresh
      // then resumes it (targeting exactly that row, not the first actionable one), while only stops
      // here so the deposit can be resumed later in stages (manual on-chain checkpoints between).
      const freshTxid =
        ctx.config.interruptFresh || ctx.config.interruptOnly
          ? await peginUntilInterrupt(ctx, (step) => {
              currentStep = step;
            })
          : undefined;
      if (ctx.config.interruptOnly) {
        log(
          `--interrupt-only: fresh deposit broadcast + interrupted (Pre-PegIn ${freshTxid}). Stopping before resume. Verify on-chain until it shows "Submit WOTS Key", then run: --action=resume --txid=${freshTxid}${ctx.config.split ? " --split" : ""}`,
        );
        return;
      }
      await runResumeFlow(
        ctx,
        (step) => {
          currentStep = step;
        },
        freshTxid,
      );
    } finally {
      await recorder.stop();
      context.off("page", handler);
    }
  },
};
