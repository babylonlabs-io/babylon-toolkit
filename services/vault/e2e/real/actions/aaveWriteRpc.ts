/**
 * Watches the app's own ETH RPC for an Aave write (a borrow or a repay) and, with `--inject-reorg`, makes
 * that RPC show the write's block reorganized out.
 *
 * A reorganization cannot be ordered on Sepolia, but the app only learns of one through its RPC: the
 * write's receipt disappears, or the blocks above it stop descending from its block. The app reads both
 * with one `fetch` per JSON-RPC call (viem's Multicall3 folding only touches `eth_call`), so a
 * `page.route` can answer them. It routes every request of the page and answers only POSTs carrying
 * one of those two calls, so it finds the app's RPC whichever URL the build points at — the deployed
 * site's can differ from the one this checkout's env resolves. MetaMask reads and broadcasts through
 * its own node from its extension's service worker, which the route never sees, so the write is still
 * sent and mined for real.
 *
 * What a run checks:
 *   - Every borrow and repay (the happy path): before the success screen, the app had read the block
 *     APP_AAVE_WRITE_CONFIRMATIONS − 1 above the write's, and if it had to wait for that block, the submit
 *     button showed "Confirming..." meanwhile. That is the app's depth check; an app that reports the
 *     first receipt never reads a block above it.
 *   - `--inject-reorg` (the unhappy path): while the injection holds, the app must not show the success
 *     screen and must show "Waiting for confirmation" instead. It keeps holding for REORG_WATCH_HOLD_MS,
 *     longer than the app's background watch spends waiting for the late receipt to be deep, so that
 *     wait runs out and the watch's next check (the nonce search, or another receipt round) starts while
 *     the block is still off the chain. Then it releases, and the app must reach the success screen.
 *
 * Modes:
 *   - `dropped`: once the app has had the write's receipt, every later read of it answers null. Only the
 *     receipt is hidden: the transaction still reads as mined in its block and the account's count
 *     still shows its nonce used, as a backend shows that lost the receipt but not the rest. A node
 *     that dropped the whole block would also report the transaction pending and the nonce unused, a
 *     path this mode does not reach.
 *   - `orphaned`: the receipt is still served (a backend still on the old fork), but every block above the
 *     write's, read by number, names a parent no node has, so the chain above does not descend from the
 *     write's block.
 */
import type {
  BrowserContext,
  Locator,
  Page,
  Request,
  Route,
} from "@playwright/test";

import { type NetworkName, type ReorgInjection } from "../config";
import { resolveNetworkContracts } from "../networkContracts";
import {
  FORM_SETTLE_MS,
  MS_PER_SECOND,
  REORG_HOLD_TIMEOUT_MS,
  REORG_RECOVERY_TIMEOUT_MS,
  REORG_WATCH_HOLD_MS,
  STEP_TIMEOUT_MS,
} from "../timing";

import { sweepApprovals } from "./approver";
import {
  CONFIRMING_LABEL_RX,
  DONE_BUTTON_RX,
  firstByTestid,
  readTxFailedText,
  SUCCESS_DONE_TESTID,
  TX_FAILED_RX,
  UNCONFIRMED_WRITE_TITLE_RX,
  WRITE_NOT_EXECUTED_RX,
} from "./selectors";
import {
  answerWriteRpcCall,
  createWriteRpcState,
  isRecord,
  type MinedWrite,
} from "./writeRpcAnswers";

/**
 * How deep the app needs an Aave write, counting its own block, before it reports the outcome. KEEP IN
 * SYNC with AAVE_WRITE_CONFIRMATIONS in src/applications/aave/constants.ts: the e2e layer does not
 * import from `src/` (see borrowParams.ts).
 */
export const APP_AAVE_WRITE_CONFIRMATIONS = 3;

/** The JSON-RPC methods the watch reads and, under an injection, answers. */
const WATCHED_METHODS = new Set([
  "eth_getTransactionReceipt",
  "eth_getBlockByNumber",
]);

/** Response headers that describe the RPC's original body bytes, not a re-encoded one. */
const REENCODED_BODY_HEADERS = new Set([
  "content-length",
  "content-encoding",
  "transfer-encoding",
]);

/** The single JSON-RPC call a request carries, or null for anything else (a batch, a GET, bad JSON). */
function parseJsonRpcCall(
  request: Request,
): { method: string; params: readonly unknown[] } | null {
  if (request.method() !== "POST") return null;
  let body: unknown;
  try {
    body = request.postDataJSON();
  } catch {
    return null;
  }
  if (!isRecord(body) || typeof body.method !== "string") return null;
  return {
    method: body.method,
    params: Array.isArray(body.params) ? body.params : [],
  };
}

export interface AaveWriteWatch {
  /** The write as the app's RPC first reported it mined; null before then. */
  write(): MinedWrite | null;
  deepestReadAbove(): bigint;
  /** The app asked for a block above the write's before the chain had it (see WriteRpcState). */
  waitedForDepth(): boolean;
  /** How many answers the injection changed. */
  tampered(): number;
  /** Stop the injection: from now on the RPC's real answers reach the app. */
  release(): void;
  /** Remove the route. */
  dispose(): Promise<void>;
}

/**
 * Route the page's JSON-RPC calls through the watch for one Aave write. Install it right before the submit
 * click, so the first receipt of the account's call to the adapter is this write's, and dispose of it once
 * the outcome is checked.
 */
export async function watchAaveWriteRpc(
  page: Page,
  network: NetworkName,
  account: string,
  reorg: ReorgInjection | undefined,
  log: (m: string) => void,
): Promise<AaveWriteWatch> {
  const { appController } = resolveNetworkContracts(network);
  const state = createWriteRpcState(account, appController, reorg);
  let loggedWrite = false;
  let loggedTamper = false;

  // Every request: anything that is not a POST of one watched call falls through untouched.
  const matches = "**/*";
  const handler = async (route: Route) => {
    const call = parseJsonRpcCall(route.request());
    if (!call || !WATCHED_METHODS.has(call.method)) return route.fallback();
    const response = await route.fetch().catch(() => null);
    // The page gets the network error it would have had; a fallback would resend the call past the
    // injection and the tracking.
    if (!response) return route.abort();
    const body: unknown = await response.json().catch(() => null);
    if (!isRecord(body) || !("result" in body))
      return route.fulfill({ response });

    const result = answerWriteRpcCall(
      state,
      call.method,
      call.params,
      body.result,
    );
    if (state.write && !loggedWrite) {
      loggedWrite = true;
      log(
        `Aave write ${state.write.hash} first reported mined in block ${state.write.blockNumber}`,
      );
    }
    if (state.tampered > 0 && !loggedTamper) {
      loggedTamper = true;
      log(
        `Reorg injection (${reorg}): the app's RPC now shows block ${state.write?.blockNumber} reorganized out`,
      );
    }
    // The body is re-encoded, so the original length and encoding no longer describe it.
    const headers = Object.fromEntries(
      Object.entries(response.headers()).filter(
        ([name]) => !REENCODED_BODY_HEADERS.has(name.toLowerCase()),
      ),
    );
    return route.fulfill({
      status: response.status(),
      headers,
      json: { ...body, result },
    });
  };
  await page.route(matches, handler);

  return {
    write: () => state.write,
    deepestReadAbove: () => state.deepestReadAbove,
    waitedForDepth: () => state.waitedForDepth,
    tampered: () => state.tampered,
    release() {
      state.holding = false;
    },
    dispose: () => page.unroute(matches, handler),
  };
}

/**
 * Whether the submit button reads "Confirming..." (COPY.common.confirming) for the wait to be deep enough
 * right now. The loan forms show the same label for a write already held as unconfirmed, so a read taken
 * while "Waiting for confirmation" shows, before or after the label, does not count.
 */
export async function readsConfirming(
  page: Page,
  cta: Locator,
): Promise<boolean> {
  const unconfirmed = page.getByText(UNCONFIRMED_WRITE_TITLE_RX).first();
  const showsUnconfirmed = () => unconfirmed.isVisible().catch(() => false);
  if (await showsUnconfirmed()) return false;
  const label = await cta
    .innerText({ timeout: FORM_SETTLE_MS })
    .catch(() => "");
  if (!CONFIRMING_LABEL_RX.test(label.trim())) return false;
  return !(await showsUnconfirmed());
}

/**
 * The happy-path check, once the success screen shows: before reporting the write, the app had read the
 * block APP_AAVE_WRITE_CONFIRMATIONS − 1 above the write's, and if it had to wait for that block, the
 * button showed "Confirming..." meanwhile.
 */
export function assertReportedOnlyWhenBuried(
  watch: AaveWriteWatch,
  sawConfirming: boolean,
  flow: "Borrow" | "Repay",
  log: (m: string) => void,
): void {
  const write = watch.write();
  if (!write)
    throw new Error(
      `${flow} reached the success screen, but the app's RPC never served the write's receipt through the watch — the route did not see the app's reads, so this run checked nothing.`,
    );
  // When the chain was already deep enough at the app's first look, the label shows only until that one
  // read returns, which can fall between two samples; it is required only when the app had to wait.
  if (!sawConfirming && watch.waitedForDepth())
    throw new Error(
      `${flow} reached the success screen without its button ever reading "Confirming..." while the app waited for the write to be deep on the chain.`,
    );
  const required = BigInt(APP_AAVE_WRITE_CONFIRMATIONS - 1);
  const read = watch.deepestReadAbove();
  if (read < required)
    throw new Error(
      `${flow} reached the success screen after reading only ${read} block(s) above the write's block ${write.blockNumber}; it must read ${required} first, so it reported a write that was not ${APP_AAVE_WRITE_CONFIRMATIONS} blocks deep.`,
    );
  log(
    `✅ The app reported the ${flow.toLowerCase()} only once it was ${APP_AAVE_WRITE_CONFIRMATIONS} blocks deep (read block ${write.blockNumber + read}), ${
      sawConfirming
        ? 'showing "Confirming..." meanwhile.'
        : 'already that deep at its first look, so "Confirming..." was not required.'
    }`,
  );
}

/**
 * The unhappy path (`--inject-reorg`): after the submit click, the write must not be reported while the
 * injection shows its block reorganized out. The app must show "Waiting for confirmation", and still not
 * report it while held for REORG_WATCH_HOLD_MS more. Then the injection releases and the app must reach
 * the success screen, having read the chain at depth. Approves the MetaMask prompts on the way.
 */
export async function confirmReorgHeldThenReported({
  page,
  context,
  log,
  cta,
  watch,
  flow,
  successRx,
}: {
  page: Page;
  context: BrowserContext;
  log: (m: string) => void;
  cta: Locator;
  watch: AaveWriteWatch;
  flow: "Borrow" | "Repay";
  successRx: RegExp;
}): Promise<void> {
  const successTitle = page.getByText(successRx).first();
  const successDone = page.locator(SUCCESS_DONE_TESTID).first();
  const doneButton = firstByTestid(
    page,
    SUCCESS_DONE_TESTID,
    page.getByRole("button", { name: DONE_BUTTON_RX }),
  );
  const txFailed = page.getByText(TX_FAILED_RX).first();
  const notExecuted = page.getByText(WRITE_NOT_EXECUTED_RX).first();
  const unconfirmed = page.getByText(UNCONFIRMED_WRITE_TITLE_RX).first();
  const isVisible = (locator: Locator) =>
    locator.isVisible().catch(() => false);
  const showsSuccess = async () =>
    (await isVisible(successTitle)) || (await isVisible(successDone));
  const failIfEnded = async () => {
    if (await isVisible(txFailed)) {
      const detail = await readTxFailedText(page);
      throw new Error(
        `${flow} failed while its block was reorganized out${detail ? ` — the form shows "${detail}"` : ""}. The write was mined, so the app must hold it as unconfirmed, not call it failed.`,
      );
    }
    if (await isVisible(notExecuted)) {
      const text = (await notExecuted.innerText().catch(() => ""))
        .replace(/\s+/g, " ")
        .trim();
      throw new Error(
        `${flow} ended as not executed while its block was reorganized out — the form shows "${text}".`,
      );
    }
  };

  let sawConfirming = false;
  const holdDeadline = Date.now() + REORG_HOLD_TIMEOUT_MS;
  for (;;) {
    if (Date.now() >= holdDeadline)
      throw new Error(
        watch.write()
          ? `${flow}: no "Waiting for confirmation" within ${Math.round(REORG_HOLD_TIMEOUT_MS / MS_PER_SECOND)}s while its block was reorganized out (${watch.tampered()} answer(s) changed).`
          : `${flow}: the app's RPC never served the write's receipt within ${Math.round(REORG_HOLD_TIMEOUT_MS / MS_PER_SECOND)}s — the write was not mined, or the route did not see the app's reads.`,
      );
    await sweepApprovals(context, page, log);
    if (!sawConfirming) sawConfirming = await readsConfirming(page, cta);
    if (await showsSuccess())
      throw new Error(
        watch.tampered() > 0
          ? `${flow} reached the success screen while its block was reorganized out (${watch.tampered()} answer(s) changed) — the app reported a write that is not on the chain.`
          : `${flow} reached the success screen before the injection changed any answer — the app reported the write without re-reading it at depth.`,
      );
    await failIfEnded();
    if (await isVisible(unconfirmed)) break;
    await page.waitForTimeout(FORM_SETTLE_MS);
  }
  if (watch.tampered() === 0)
    throw new Error(
      `${flow} shows "Waiting for confirmation", but the injection never changed an answer — something else held the write, so this run tested nothing.`,
    );
  if (!sawConfirming)
    throw new Error(
      `${flow}'s button never read "Confirming..." between the write being mined and "Waiting for confirmation".`,
    );
  log(
    `✅ The app holds the ${flow.toLowerCase()} as unconfirmed while its block is reorganized out (${watch.tampered()} answer(s) changed) — holding ${Math.round(REORG_WATCH_HOLD_MS / MS_PER_SECOND)}s more for its background watch`,
  );

  const watchHoldUntil = Date.now() + REORG_WATCH_HOLD_MS;
  while (Date.now() < watchHoldUntil) {
    if (await showsSuccess())
      throw new Error(
        `${flow} reached the success screen from its background watch while its block was still reorganized out — the watch reported a late receipt that is not on the chain.`,
      );
    await failIfEnded();
    await page.waitForTimeout(FORM_SETTLE_MS);
  }

  watch.release();
  log("Reorg injection released: the write's block is back on the chain");
  const recoverDeadline = Date.now() + REORG_RECOVERY_TIMEOUT_MS;
  while (Date.now() < recoverDeadline) {
    await sweepApprovals(context, page, log);
    if (await showsSuccess()) {
      assertReportedOnlyWhenBuried(watch, sawConfirming, flow, log);
      log(`✅ ${flow} successful once its block was back — clicking Done`);
      await doneButton.click({ timeout: STEP_TIMEOUT_MS }).catch(() => {});
      return;
    }
    await failIfEnded();
    await page.waitForTimeout(FORM_SETTLE_MS);
  }
  throw new Error(
    `${flow} did not reach the success screen within ${Math.round(REORG_RECOVERY_TIMEOUT_MS / MS_PER_SECOND)}s after its block was back on the chain.`,
  );
}
