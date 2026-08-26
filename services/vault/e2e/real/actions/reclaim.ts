/**
 * The "reclaim" action: sweep the depositor-claim reserve (PegIn output 1) back to the depositor.
 *
 * Every peg-in sets aside ~26–33k sats at PegIn output 1 to fund the depositor's own emergency claim
 * transaction. On the normal path the vault provider claims from its own wallet, nothing ever spends
 * that output, and it strands. Reclaim is the row action that sweeps it back, and it is offered only
 * once the withdrawal has settled on Bitcoin: PegIn output 0 spent, six confirmations deep.
 *
 * Click path: /vaults → Inactive Vaults → a row's "Reclaim" → Review ("Confirm") → ONE BTC wallet
 * signature (no Ethereum transaction at all) → "Reclaim submitted" → "Done".
 *
 * ⚠️ NEVER run without an explicit go-ahead, and never against a vault that is still live. This spends
 * real BTC and the spend is IRREVERSIBLE in a way an ordinary transaction is not: the depositor's
 * emergency claim transaction is pre-signed to spend that exact outpoint, and every later transaction
 * in that chain is signed against it. There is no re-funding path. Sweeping the reserve of a live vault
 * destroys the depositor's recovery material permanently. The app's own gate is what protects against
 * this — `--dry-run` stops before the signature so the gate and the review screen can be exercised
 * without spending anything.
 *
 * What this run actually proves. The UI can only show that the button worked; the interesting failures
 * are invisible from the screen. So after the broadcast the run reads the transaction back off the
 * chain and asserts its shape (see `reclaimParams.ts`): one input at `(peginTxid, 1)`, a three-item
 * script-path witness rather than a key-path one, the single-leaf claim script and its 33-byte control
 * block, value conservation, and the modelled 513 weight units. Those results are written to
 * `reclaim.json` in the run's artifacts directory alongside the gate state at authorisation time.
 */
import type { Locator, Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { NETWORKS } from "../config";
import {
  snapshotGate,
  verifyReclaimTx,
  type ReclaimGateSnapshot,
  type ReclaimVerification,
} from "../reclaimParams";
import {
  FORM_SETTLE_MS,
  MS_PER_SECOND,
  WITHDRAW_MODAL_TIMEOUT_MS,
} from "../timing";

import { installPopupApprover, sweepApprovals } from "./approver";
import { goToSection } from "./navigation";
import { startRecording } from "./recording";
import { DONE_BUTTON_RX, firstByTestid } from "./selectors";
import { type Action, type ActionContext } from "./types";
import { connectWallets } from "./walletConnect";

const RECLAIM_BUTTON_TESTID = '[data-testid="vault-reclaim-button"]';
const CONFIRM_BUTTON_TESTID = '[data-testid="reclaim-confirm-button"]';
const DONE_BUTTON_TESTID = '[data-testid="reclaim-done-button"]';

/** How long to wait for a reclaimable row to appear. The poller runs on a 60s tick. */
const RECLAIM_ROW_TIMEOUT_MS = 90 * MS_PER_SECOND;
/** How long to wait for the broadcast after the wallet signature comes back. */
const RECLAIM_BROADCAST_TIMEOUT_MS = 90 * MS_PER_SECOND;

/** A row carries an amount, a status, a provider and a hash, so its text is far longer than a label. */
const ROW_TEXT_MIN_CHARS = 40;
/** The review modal carries four labelled rows plus a heading and a description. */
const MODAL_TEXT_MIN_CHARS = 80;
/** How far up the DOM to look for the enclosing row / modal before giving up. */
const ENCLOSING_MAX_DEPTH = 8;

/**
 * Text of the nearest ancestor of `locator` that reads like a container rather than the control
 * itself — the first one at least `minChars` long.
 *
 * Walking up by a fixed number of levels would be brittle against markup changes, and the control's
 * own text ("Reclaim", "Confirm") is never what we want to record. Returns the deepest text found if
 * nothing reaches the threshold, so a changed layout degrades to less context rather than to nothing.
 */
async function enclosingText(
  locator: Locator,
  minChars: number,
): Promise<string> {
  let best = "";
  for (let depth = 1; depth <= ENCLOSING_MAX_DEPTH; depth++) {
    const text = (
      await locator
        .locator(`xpath=ancestor::*[${depth}]`)
        .innerText()
        .catch(() => "")
    )
      .replace(/\s+/g, " ")
      .trim();
    if (text.length > best.length) best = text;
    if (text.length >= minChars) return text;
  }
  return best;
}

/** `/tx/<64-hex>/outspend/1` — the preview's probe of the reserve, which names the PegIn. */
const OUTSPEND_URL_RX = /\/tx\/([0-9a-f]{64})\/outspend\/1(?:\?|$)/;
/** A bare 64-hex body is what `POST /tx` returns on a successful broadcast. */
const TXID_BODY_RX = /^[0-9a-f]{64}$/;

/**
 * Watch the page's network traffic for the two txids this run needs.
 *
 * The success screen opens the explorer with `window.open` rather than rendering a link, so the swept
 * txid is not readable from the DOM. Both values are already crossing the wire, so we read them there:
 * the PegIn from the preview's own outspend probe, and the broadcast txid from the push response.
 */
function watchTxids(page: Page, log: (m: string) => void) {
  const peginTxids = new Set<string>();
  let broadcastTxid: string | undefined;

  const onRequest = (url: string) => {
    const match = OUTSPEND_URL_RX.exec(url);
    if (match) peginTxids.add(match[1]);
  };

  page.on("request", (req) => onRequest(req.url()));
  page.on("response", async (res) => {
    if (broadcastTxid) return;
    const req = res.request();
    if (
      req.method() !== "POST" ||
      !/\/tx\/?$/.test(new URL(res.url()).pathname)
    )
      return;
    try {
      const body = (await res.text()).trim();
      if (TXID_BODY_RX.test(body)) {
        broadcastTxid = body;
        log(`Broadcast txid observed on the wire: ${body}`);
      }
    } catch {
      // The body may already be consumed or the response aborted; the DOM fallback still applies.
    }
  });

  return {
    peginTxids: () => Array.from(peginTxids),
    broadcastTxid: () => broadcastTxid,
  };
}

export const reclaimAction: Action = {
  id: "reclaim",
  async run(ctx: ActionContext): Promise<void> {
    const { page, context, log, artifactsDir, config } = ctx;
    const mempoolApiBase = NETWORKS[config.network].mempoolApiBase;
    const dryRun = config.reclaimDryRun === true;

    const handler = installPopupApprover(context, log);
    let currentStep = "connect";
    const recorder = await startRecording(
      context,
      page,
      artifactsDir,
      log,
      () => currentStep,
    );

    const watcher = watchTxids(page, log);
    let gate: ReclaimGateSnapshot | undefined;
    let verification: ReclaimVerification | undefined;
    let rowSummary = "";

    try {
      await connectWallets(ctx);

      currentStep = "open-vaults";
      await goToSection(page, "vaults", log);
      await page.waitForTimeout(FORM_SETTLE_MS);

      currentStep = "find-reclaimable-row";
      // An ineligible vault renders no button at all, and a blocked one (paused protocol, Ledger)
      // renders a disabled one — so "enabled" is the real selector for something we can act on.
      const reclaimButton = page
        .locator(`${RECLAIM_BUTTON_TESTID}:not([disabled])`)
        .first();
      log(
        `Waiting up to ${RECLAIM_ROW_TIMEOUT_MS / MS_PER_SECOND}s for a reclaimable row ` +
          `(the reserve poller runs on a 60s tick, so a cold load can take one cycle)…`,
      );
      await reclaimButton.waitFor({
        state: "visible",
        timeout: RECLAIM_ROW_TIMEOUT_MS,
      });

      // Record what the row said before touching it — the reclaimable figure and the vault's own
      // identifiers are the human-readable cross-check against the transaction we verify later.
      rowSummary = await enclosingText(reclaimButton, ROW_TEXT_MIN_CHARS);
      log(`Reclaimable row: ${rowSummary || "(row text unavailable)"}`);

      currentStep = "open-review";
      await reclaimButton.click();

      const confirmButton = firstByTestid(
        page,
        CONFIRM_BUTTON_TESTID,
        page.getByRole("button", { name: /^confirm$/i }),
      );
      await confirmButton.waitFor({
        state: "visible",
        timeout: WITHDRAW_MODAL_TIMEOUT_MS,
      });
      await page.waitForTimeout(FORM_SETTLE_MS);

      // Scope to the modal rather than the page: the review's amount, fee rate, network fee and
      // "you receive" are the numbers worth recording, and a whole-page capture buries them under
      // the dashboard behind it.
      const reviewText = await enclosingText(
        confirmButton,
        MODAL_TEXT_MIN_CHARS,
      );
      log(`Review screen: ${reviewText || "(modal text unavailable)"}`);

      // The preview has now probed the chain, so the PegIn txid is on the wire. Snapshot the gate's
      // inputs before authorising anything.
      const [peginTxid] = watcher.peginTxids();
      if (peginTxid) {
        gate = await snapshotGate(mempoolApiBase, peginTxid);
        log(
          `Gate at authorisation: PegIn ${peginTxid} · payout spent=${gate.payoutSpend.spent} ` +
            `confirmed=${gate.payoutSpend.confirmed} depth=${gate.payoutConfirmations ?? "?"} · ` +
            `reserve spent=${gate.reserveSpend.spent} value=${gate.reserveValueSats ?? "?"} sats · ` +
            `tip=${gate.tipHeight}`,
        );
      } else {
        log(
          "⚠️  Could not observe the PegIn txid on the wire — the gate snapshot will be skipped. " +
            "The post-broadcast shape checks still run.",
        );
      }

      if (dryRun) {
        log(
          "🛑 --dry-run: stopping BEFORE the signature. The eligibility gate and the review screen " +
            "have been exercised; nothing was spent.",
        );
        return;
      }

      if (await confirmButton.isDisabled()) {
        throw new Error(
          "Confirm is disabled on the review screen — the fee is over a cap, the output is dust, " +
            "or the mempool fee rate could not be fetched. See the review text above.",
        );
      }

      currentStep = "sign-and-broadcast";
      log("Confirming — this signs and broadcasts a real Bitcoin transaction.");
      await confirmButton.click();
      await sweepApprovals(context, page, log).catch((err) => {
        log(`Approval sweep reported: ${String(err)}`);
      });

      currentStep = "await-success";
      const doneButton = firstByTestid(
        page,
        DONE_BUTTON_TESTID,
        page.getByRole("button", { name: DONE_BUTTON_RX }),
      );
      await doneButton.waitFor({
        state: "visible",
        timeout: RECLAIM_BROADCAST_TIMEOUT_MS,
      });
      log("Success screen reached.");

      const broadcastTxid = watcher.broadcastTxid();
      if (!broadcastTxid) {
        throw new Error(
          "The success screen appeared but no broadcast txid was observed on the wire — cannot " +
            "verify the transaction's shape.",
        );
      }

      currentStep = "verify-onchain";
      log(`Verifying ${broadcastTxid} against the chain…`);
      verification = await verifyReclaimTx(mempoolApiBase, broadcastTxid, {
        peginTxid,
        depositorAddress: ctx.btc.address,
      });

      for (const c of verification.checks) {
        log(
          `  ${c.ok ? "✅" : "❌"} ${c.name} — expected ${c.expected}, got ${c.actual}`,
        );
      }
      log(
        `Swept ${verification.inputValueSats ?? "?"} sats → ${verification.outputValueSats} sats ` +
          `(fee ${verification.feeSats} sats, ${verification.vsize} vB, ` +
          `${verification.feeRateSatsVb ?? "?"} sat/vB)`,
      );

      await doneButton.click().catch(() => undefined);

      if (!verification.allPassed) {
        throw new Error(
          "The reclaim broadcast but its on-chain shape failed verification — see the ❌ lines above " +
            "and reclaim.json.",
        );
      }
      log("✅ Reclaim complete and verified on chain.");
    } finally {
      writeFileSync(
        join(artifactsDir, "reclaim.json"),
        `${JSON.stringify(
          {
            network: config.network,
            mempoolApiBase,
            dryRun,
            btcAddress: ctx.btc.address,
            ethAddress: ctx.eth.address,
            rowSummary,
            observedPeginTxids: watcher.peginTxids(),
            broadcastTxid: watcher.broadcastTxid() ?? null,
            gate: gate ?? null,
            verification: verification ?? null,
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      log(`Wrote ${join(artifactsDir, "reclaim.json")}`);
      await recorder.stop();
      context.off("page", handler);
    }
  },
};
