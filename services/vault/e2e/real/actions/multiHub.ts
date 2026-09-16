/**
 * The "multi-hub" action: borrow from several Aave hubs and repay each, end-to-end on real Sepolia,
 * against existing collateral. Two reserve sets:
 *   - one token on every hub that lists it (`--borrow-token`, required — never picked implicitly, since
 *     each leg moves real value; devnet lists USDC and WBTC on both the Babylon Hub and the Core Hub);
 *   - every borrowable reserve on every hub (`--all-reserves`), including tokens on a single hub, whose
 *     borrow skips Select hub.
 *
 * For that set it:
 *   1. borrows from each reserve in turn — /loans → Borrow → Select asset → Select hub (that reserve's
 *      row, when shown) → form — checking on-chain after each leg that the debt landed on that reserve;
 *   2. opens /loans and checks there is one Active Loans row per reserve, each naming its hub;
 *   3. repays each reserve in full through the repay picker, checking on-chain that its debt is back to
 *      what it was before the run.
 *
 * Each leg reuses the borrow / repay actions' flows pinned to one reserve id, so every UI step and
 * post-condition those actions assert applies here too. Borrow size: `--borrow-usd=<n>` converts n USD
 * to each token at the Aave oracle price (for a set spanning tokens of very different prices), else
 * a numeric `--borrow-amount` applies to every leg, else the borrow action's conservative default.
 * Every repay leg uses the form's Max, so a clean run leaves no debt it created. run.ts refuses the run before the browser
 * when the position has no collateral.
 *
 * NEVER run without an explicit go-ahead: it moves real value (one borrow and one repay per reserve).
 */
import {
  type BorrowReserve,
  describeReserve,
  fetchBorrowableReserves,
  fetchReservePricesUsd,
  findMultiHubTokens,
} from "../borrowParams";
import { describeHub } from "../hubLabels";
import { LOAN_ROW_APPEAR_TIMEOUT_MS } from "../timing";
import { formatTokenAmount } from "../tokenAmount";

import { installPopupApprover } from "./approver";
import { runBorrowWithOptionalPegin } from "./borrow";
import { goToSection } from "./navigation";
import { startRecording } from "./recording";
import { runRepayFlow } from "./repay";
import {
  baselineOf,
  legContext,
  readReserveDebt,
  readReservesStillOwed,
  waitForReserveDebt,
} from "./reserveLegs";
import { ACTIVE_LOAN_ROW_TESTID_PREFIX, MAX_AMOUNT_KEYWORD } from "./selectors";
import { type Action, type ActionContext } from "./types";
import { connectWallets } from "./walletConnect";

/** The reserves this run borrows from, ordered by reserve id. */
async function resolveMultiHubReserves(
  ctx: ActionContext,
): Promise<BorrowReserve[]> {
  const { network, allReserves } = ctx.config;
  const reserves = await fetchBorrowableReserves(network);
  if (allReserves) {
    if (reserves.length === 0)
      throw new Error(`multi-hub: no borrowable reserves on ${network}.`);
    return [...reserves].sort((a, b) => (a.reserveId < b.reserveId ? -1 : 1));
  }

  const tokens = findMultiHubTokens(reserves);
  if (tokens.length === 0)
    throw new Error(
      `multi-hub: no token is borrowable from more than one hub on ${network} — nothing to exercise.`,
    );
  const wanted = ctx.config.borrowToken?.trim();
  if (!wanted)
    throw new Error(
      `multi-hub: no --borrow-token to borrow from every hub (tokens on more than one hub: ${tokens.map((t) => t.symbol).join(", ")}) — pass one, or --all-reserves.`,
    );
  const matches = tokens.filter(
    (token) => token.symbol.toLowerCase() === wanted.toLowerCase(),
  );
  if (matches.length === 1) return matches[0].reserves;
  throw new Error(
    matches.length === 0
      ? `multi-hub: ${wanted} is not borrowable from more than one hub on ${network} (tokens on several hubs: ${tokens.map((t) => t.symbol).join(", ")}).`
      : `multi-hub: more than one token listed on several hubs is called ${wanted} (${matches.map((t) => t.tokenAddress).join(", ")}).`,
  );
}

/**
 * One borrow leg's `--borrow-amount`: `--borrow-usd` converted at the reserve's oracle price when set,
 * else the run's own `--borrow-amount` (undefined keeps the borrow action's conservative default).
 */
function legBorrowAmount(
  ctx: ActionContext,
  reserve: BorrowReserve,
  pricesUsd: ReadonlyMap<bigint, number> | null,
): string | undefined {
  const { borrowUsd } = ctx.config;
  if (borrowUsd === undefined || pricesUsd === null)
    return ctx.config.borrowAmount;
  const price = pricesUsd.get(reserve.reserveId);
  if (price === undefined || price <= 0)
    throw new Error(
      `multi-hub: no oracle price for ${describeReserve(reserve)} — cannot size a $${borrowUsd} borrow.`,
    );
  const amount = formatTokenAmount(Number(borrowUsd) / price, reserve.decimals);
  if (Number(amount) <= 0)
    throw new Error(
      `multi-hub: $${borrowUsd} of ${describeReserve(reserve)} rounds to 0 at ${reserve.decimals} decimals.`,
    );
  return amount;
}

/**
 * Open /loans and check each reserve has its own Active Loans row that names its hub. Rows are found by
 * reserve id; the label check is skipped (and logged) for a hub e2e/real/hubLabels.ts doesn't list,
 * since the app then shows the hub's short address instead.
 *
 * Returns what it found wrong rather than throwing: every leg has already borrowed by this point, and a
 * display check must not abort the run before the repay legs clear that debt.
 */
async function checkLoanRowsNameHubs(
  ctx: ActionContext,
  reserves: BorrowReserve[],
): Promise<string[]> {
  const { page, log } = ctx;
  const problems: string[] = [];
  try {
    await goToSection(page, "loans", log);
    for (const reserve of reserves) {
      const row = page.locator(
        `[data-testid="${ACTIVE_LOAN_ROW_TESTID_PREFIX}${reserve.reserveId}"]`,
      );
      const appeared = await row
        .waitFor({ state: "visible", timeout: LOAN_ROW_APPEAR_TIMEOUT_MS })
        .then(() => true)
        .catch(() => false);
      if (!appeared) {
        problems.push(
          `no Active Loans row for ${describeReserve(reserve)} within ${LOAN_ROW_APPEAR_TIMEOUT_MS}ms`,
        );
        continue;
      }
      const hubLabel = describeHub(reserve.hub);
      if (hubLabel === reserve.hub) {
        log(
          `⚠️ ${describeReserve(reserve)}: hub not in hubLabels.ts — found its Loans row, skipped the hub label check.`,
        );
        continue;
      }
      const text = await row.innerText();
      if (!text.includes(hubLabel)) {
        problems.push(
          `the Loans row for ${describeReserve(reserve)} does not name its hub (row text: "${text.replace(/\s+/g, " ").trim()}")`,
        );
        continue;
      }
      log(`✅ Loans row for ${describeReserve(reserve)} names ${hubLabel}.`);
    }
  } catch (error) {
    problems.push(
      `the Loans row check stopped before it finished (${error instanceof Error ? error.message : String(error)})`,
    );
  }
  return problems;
}

export const multiHubAction: Action = {
  id: "multi-hub",
  async run(ctx: ActionContext): Promise<void> {
    const { page, context, log, artifactsDir } = ctx;

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

      const reserves = await resolveMultiHubReserves(ctx);
      log(`Multi-hub: ${reserves.map(describeReserve).join("; ")}`);
      const pricesUsd =
        ctx.config.borrowUsd === undefined
          ? null
          : await fetchReservePricesUsd(
              ctx.config.network,
              reserves.map((r) => r.reserveId),
            );

      // Each reserve's debt before this run borrowed from it, the legs whose borrow was started, and the
      // legs confirmed back at that debt. A leg counts as started before its borrow flow runs: the flow can
      // submit and then still throw on a post-check, and that debt is real.
      const baselines = new Map<bigint, number>();
      const attempted: BorrowReserve[] = [];
      const cleared = new Set<bigint>();
      try {
        for (const reserve of reserves) {
          const borrowAmount = legBorrowAmount(ctx, reserve, pricesUsd);
          const before = await readReserveDebt(ctx, reserve.reserveId);
          baselines.set(reserve.reserveId, before);
          log(
            `── Borrow leg: ${describeReserve(reserve)}${borrowAmount ? ` — ${borrowAmount} ${reserve.symbol}` : ""}`,
          );
          attempted.push(reserve);
          const borrowed = await runBorrowWithOptionalPegin(
            legContext(ctx, {
              borrowReserveId: reserve.reserveId.toString(),
              borrowToken: reserve.symbol,
              borrowHub: undefined,
              borrowAmount,
              peginFirst: false,
            }),
            (step) => {
              currentStep = `borrow:${reserve.reserveId}:${step}`;
            },
          );
          currentStep = `borrow:${reserve.reserveId}:reserve-debt`;
          await waitForReserveDebt(
            ctx,
            reserve,
            before,
            "rise",
            borrowed.amount.mode === "amount"
              ? borrowed.amount.value
              : undefined,
          );
        }

        currentStep = "loans-rows";
        // Reported after the repay legs: the borrows have landed, so failing here would strand them.
        const rowProblems = await checkLoanRowsNameHubs(ctx, reserves);
        for (const problem of rowProblems) log(`❌ ${problem}`);

        for (const reserve of reserves) {
          log(`── Repay leg: ${describeReserve(reserve)}`);
          await runRepayFlow(
            legContext(ctx, {
              repayReserveId: reserve.reserveId.toString(),
              repayToken: reserve.symbol,
              repayHub: undefined,
              // In full: a partial repay would leave debt this run created.
              repayAmount: MAX_AMOUNT_KEYWORD,
              borrowFirst: false,
            }),
            (step) => {
              currentStep = `repay:${reserve.reserveId}:${step}`;
            },
          );
          currentStep = `repay:${reserve.reserveId}:reserve-debt`;
          await waitForReserveDebt(
            ctx,
            reserve,
            baselineOf(baselines, reserve),
            "clear",
          );
          cleared.add(reserve.reserveId);
        }

        if (rowProblems.length > 0)
          throw new Error(
            `multi-hub: every borrow and repay ran, but the Loans rows were wrong — ${rowProblems.join("; ")}.`,
          );
      } catch (error) {
        const open = attempted.filter(
          (reserve) => !cleared.has(reserve.reserveId),
        );
        if (open.length === 0) throw error;
        const message = error instanceof Error ? error.message : String(error);
        // Ask the chain which of those legs actually left debt, rather than guessing from how far the run got.
        const stillOwed = await readReservesStillOwed(ctx, open, baselines);
        if (stillOwed === null)
          throw new Error(
            `${message} — could not re-read the debt, so up to ${open.length} reserve${open.length === 1 ? "" : "s"} this run borrowed from may still be owed (${open.map(describeReserve).join("; ")}); check and clear it with --action=repay-all.`,
            { cause: error },
          );
        // The tolerance scales with each reserve's pre-run debt, so a small leg on a heavily borrowed
        // reserve can read as interest: the legs that don't read as owed are named too.
        const unconfirmed = open.filter(
          (reserve) => !stillOwed.includes(reserve),
        );
        const report: string[] = [];
        if (stillOwed.length > 0)
          report.push(
            `still owed after this run: ${stillOwed.map(describeReserve).join("; ")}`,
          );
        if (unconfirmed.length > 0)
          report.push(
            `not read as owed, though a small leg on a reserve that already owed a lot can read as interest: ${unconfirmed.map(describeReserve).join("; ")}`,
          );
        throw new Error(
          `${message} — ${report.join("; ")}; check the debt, and clear it with --action=repay-all if needed.`,
          { cause: error },
        );
      }
      log("✅ Multi-hub complete.");
    } finally {
      await recorder.stop();
      context.off("page", handler);
    }
  },
};
