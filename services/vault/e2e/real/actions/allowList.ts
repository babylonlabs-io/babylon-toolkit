/**
 * The "allow-list" action: open and fill the deposit form, never submit it, and check its CTA against
 * the depositor allow-list on chain.
 *
 * The run first asks the chain itself (allowListParams.ts) whether the registry would take a deposit
 * from the connected Ethereum account, then watches the app ask the same question on its own RPC
 * (`checkAllowed`, answered truthfully — nothing is injected). Then:
 *   - not on the list: the CTA must read "Ethereum wallet not on the allow list" and stay disabled
 *     through a hold longer than the form's refetch interval, across at least one new answered read;
 *   - on the list (or the gate removed): the CTA must reach the enabled "Deposit".
 * Either way the app must have asked about this account and this application and been told the chain's
 * answer (a read whose call failed inside the RPC's answer is counted, not judged: the app fails open on
 * it; a read the RPC refused outright is not recorded at all), no wallet window may open once the
 * wallets are connected, and the account's pending nonce must not move. On the list, the CTA is read
 * again once the app has its answer: the form fails open while the read is in flight, so "Deposit"
 * before the answer says nothing about the list.
 *
 * Spends nothing: the form is never submitted. Run it on `--target=localhost` to test local app code;
 * the gate is on in the `testnet` network's deployment and removed in devnet's.
 */
import type { Page, Response } from "@playwright/test";
import { sepolia } from "viem/chains";

import {
  readAllowListVerdict,
  type AllowListVerdict,
} from "../allowListParams";
import { readPendingNonce } from "../positionCapacityParams";
import {
  ALLOW_LIST_BLOCK_HOLD_MS,
  DEPOSIT_CTA_ENABLE_TIMEOUT_MS,
  FORM_SETTLE_MS,
  STEP_TIMEOUT_MS,
} from "../timing";

import {
  appAllowListAnswers,
  assertAppHeardChain,
  mayCarryCheckAllowed,
  readAllowListAnswers,
  type AllowListRead,
  type AppAllowListAnswers,
} from "./allowListRpcAnswers";
import { installPopupApprover } from "./approver";
import { parseJsonRpcCall } from "./jsonRpcRoute";
import { DEPOSIT_CTA_LABEL, openDepositForm, waitForDepositCta } from "./pegin";
import { startRecording } from "./recording";
import { ALLOW_LIST_CTA_LABEL, FLUID_CTA_SELECTOR } from "./selectors";
import { type Action, type ActionContext } from "./types";
import { connectWallets } from "./walletConnect";

const MULTICALL3 = sepolia.contracts.multicall3.address;

/** Every `checkAllowed` read the page makes, with the RPC's answer. Passive: nothing is rewritten. */
function watchAllowListReads(page: Page): {
  reads: AllowListRead[];
  dispose: () => void;
} {
  const reads: AllowListRead[] = [];
  const onResponse = (response: Response) => {
    const request = response.request();
    if (!mayCarryCheckAllowed(request.postData() ?? "")) return;
    const call = parseJsonRpcCall(request);
    if (call?.method !== "eth_call") return;
    void response
      .json()
      .then((body: unknown) => {
        const result = (body as { result?: unknown } | null)?.result;
        if (typeof result !== "string") return;
        reads.push(
          ...readAllowListAnswers(
            call.params[0],
            result as `0x${string}`,
            MULTICALL3,
          ),
        );
      })
      .catch(() => {});
  };
  page.on("response", onResponse);
  return { reads, dispose: () => page.off("response", onResponse) };
}

/** Wallet windows that open from now on. */
function watchWalletWindows(ctx: ActionContext): {
  urls: string[];
  dispose: () => void;
} {
  const urls: string[] = [];
  const onWindow = (opened: Page) => {
    void opened
      .waitForLoadState("domcontentloaded")
      .catch(() => {})
      .then(() => {
        const url = opened.url();
        if (url.startsWith("chrome-extension://")) urls.push(url);
      });
  };
  ctx.context.on("page", onWindow);
  return { urls, dispose: () => ctx.context.off("page", onWindow) };
}

async function readCta(
  page: Page,
): Promise<{ label: string; enabled: boolean }> {
  const cta = page.locator(FLUID_CTA_SELECTOR).first();
  return {
    label: (await cta.textContent().catch(() => ""))?.trim() ?? "",
    enabled: await cta.isEnabled().catch(() => false),
  };
}

/**
 * Wait for the blocked CTA, then require it to hold with no wallet window opening, across at least one
 * new answered read: the hold exists to cover the form re-reading the list, so a hold without one has
 * not tested what it claims to.
 */
async function assertFormBlocked(
  ctx: ActionContext,
  windows: { urls: string[] },
  answeredReads: () => number,
): Promise<void> {
  const { page, log } = ctx;
  const blocked = (cta: { label: string; enabled: boolean }) =>
    cta.label === ALLOW_LIST_CTA_LABEL && !cta.enabled;

  let lastLabel = "";
  const deadline = Date.now() + DEPOSIT_CTA_ENABLE_TIMEOUT_MS;
  for (;;) {
    const cta = await readCta(page);
    if (cta.label && cta.label !== lastLabel) {
      log(`Deposit CTA: "${cta.label}"${cta.enabled ? "" : " (disabled)"}`);
      lastLabel = cta.label;
    }
    if (blocked(cta)) break;
    if (Date.now() > deadline)
      throw new Error(
        `The deposit form never blocked an account the chain says is not on the allow-list: expected a disabled "${ALLOW_LIST_CTA_LABEL}" (last CTA: "${lastLabel}").`,
      );
    await page.waitForTimeout(FORM_SETTLE_MS);
  }

  // The read that blocked the form is recorded only once its response body is parsed, which can land
  // after the CTA shows it; counted from before that, it would pass for the refetch.
  const recordedBy = Date.now() + STEP_TIMEOUT_MS;
  while (answeredReads() === 0) {
    if (Date.now() > recordedBy)
      throw new Error(
        `The deposit form blocked, but no answered checkAllowed read about this account was recorded within ${STEP_TIMEOUT_MS / 1000}s, so the hold could not tell a refetch from the first read.`,
      );
    await page.waitForTimeout(FORM_SETTLE_MS);
  }

  log(
    `Deposit CTA blocked — holding ${ALLOW_LIST_BLOCK_HOLD_MS / 1000}s through a form refetch`,
  );
  const answeredBeforeHold = answeredReads();
  const holdUntil = Date.now() + ALLOW_LIST_BLOCK_HOLD_MS;
  while (Date.now() < holdUntil) {
    const cta = await readCta(page);
    if (!blocked(cta))
      throw new Error(
        `The deposit form unblocked an account that is not on the allow-list: the CTA became "${cta.label}"${cta.enabled ? " (enabled)" : ""}.`,
      );
    if (windows.urls.length > 0)
      throw new Error(
        `A wallet window opened on a blocked deposit form: ${windows.urls.join(", ")}.`,
      );
    await page.waitForTimeout(FORM_SETTLE_MS);
  }
  if (answeredReads() <= answeredBeforeHold)
    throw new Error(
      `The form did not re-read the allow-list during the ${ALLOW_LIST_BLOCK_HOLD_MS / 1000}s hold (no new answered checkAllowed read), so the hold did not cover a refetch.`,
    );
}

/**
 * The app must have asked the chain about this account in this application, and heard the chain's
 * answer. A read is recorded only once its response body is parsed, after the form may already show
 * the enabled "Deposit" (the form fails open while its read is in flight), so wait for an answered
 * one first.
 */
async function assertAppAsked(
  page: Page,
  verdict: AllowListVerdict,
  reads: readonly AllowListRead[],
): Promise<AppAllowListAnswers> {
  const deadline = Date.now() + STEP_TIMEOUT_MS;
  while (
    appAllowListAnswers(reads, verdict.appEntryPoint, verdict.depositor)
      .answered.length === 0 &&
    Date.now() < deadline
  )
    await page.waitForTimeout(FORM_SETTLE_MS);
  return assertAppHeardChain(reads, verdict);
}

export const allowListAction: Action = {
  id: "allow-list",
  async run(ctx: ActionContext): Promise<void> {
    const { page, context, config, log } = ctx;
    const amountBtc = config.peginAmountBtc?.trim();
    if (!amountBtc)
      throw new Error(
        "allow-list: no deposit amount resolved — the minimum-deposit fetch failed and no --amount was given. Re-run with --amount=<btc>.",
      );

    const verdict = await readAllowListVerdict(config.network, ctx.eth.address);
    log(
      `Allow-list on chain: policy ${verdict.policy}, gate ${verdict.gateRemoved ? "removed" : "on"} for ${verdict.appEntryPoint}; ${verdict.depositor} is ${verdict.allowed ? "allowed" : "NOT allowed"} → the form must ${verdict.allowed ? 'reach "Deposit"' : `show "${ALLOW_LIST_CTA_LABEL}"`}`,
    );

    // Watched from before the connect: the form reads the list as soon as an account is connected.
    const appReads = watchAllowListReads(page);
    const approver = installPopupApprover(context, log);
    const recorder = await startRecording(context, page, ctx.artifactsDir, log);
    let windows: ReturnType<typeof watchWalletWindows> | undefined;
    try {
      await connectWallets(ctx);
      context.off("page", approver);
      windows = watchWalletWindows(ctx);
      const nonceBefore = await readPendingNonce(
        config.network,
        ctx.eth.address,
      );

      // From the overview: the gate under test lives in the deposit modal, whichever page opens it,
      // and /vaults shows no deposit button while its indexed vault list cannot load.
      await openDepositForm(
        page,
        log,
        amountBtc,
        config.peginProvider?.trim() || undefined,
        false,
        "overview",
      );
      if (verdict.allowed) await waitForDepositCta(page, log);
      else
        await assertFormBlocked(
          ctx,
          windows,
          () =>
            appAllowListAnswers(
              appReads.reads,
              verdict.appEntryPoint,
              verdict.depositor,
            ).answered.length,
        );

      const heard = await assertAppAsked(page, verdict, appReads.reads);
      if (verdict.allowed) {
        // Give the form one tick to render the answer it now has.
        await page.waitForTimeout(FORM_SETTLE_MS);
        const cta = await readCta(page);
        if (cta.label !== DEPOSIT_CTA_LABEL || !cta.enabled)
          throw new Error(
            `The deposit form left "${DEPOSIT_CTA_LABEL}" once the app heard the account is allowed: the CTA became "${cta.label}"${cta.enabled ? "" : " (disabled)"}.`,
          );
      }
      if (windows.urls.length > 0)
        throw new Error(
          `A wallet window opened while only the deposit form was filled: ${windows.urls.join(", ")}.`,
        );
      const nonceAfter = await readPendingNonce(
        config.network,
        ctx.eth.address,
      );
      if (nonceAfter !== nonceBefore)
        throw new Error(
          `The account sent a transaction during the run (pending nonce ${nonceBefore} → ${nonceAfter}).`,
        );
      log(
        `Allow-list verified ✅ (the app was answered ${String(verdict.allowed)} ${heard.answered.length} time(s)${heard.unanswered.length > 0 ? `, and ${heard.unanswered.length} read(s) went unanswered` : ""}; the form ${verdict.allowed ? 'reached "Deposit"' : "stayed blocked"}; no wallet window, nothing sent)`,
      );
    } finally {
      await recorder.stop();
      windows?.dispose();
      appReads.dispose();
      context.off("page", approver);
    }
  },
};
