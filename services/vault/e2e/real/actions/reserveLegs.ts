/**
 * Shared pieces for actions that run the borrow / repay flows once per reserve (`multi-hub`,
 * `repay-all`): pinning a leg to one reserve, and checking on-chain that the leg landed on THAT reserve.
 * The borrow / repay flows only assert that the position's total USD debt moved; with one token owed to
 * several hubs, that alone can't tell which hub's reserve a leg hit.
 */
import { describeReserve } from "../borrowParams";
import type { RunConfig } from "../config";
import { fetchRepayableDebts } from "../repayParams";
import {
  MS_PER_SECOND,
  RESERVE_DEBT_VERIFY_POLL_MS,
  RESERVE_DEBT_VERIFY_TIMEOUT_MS,
} from "../timing";

import type { ActionContext } from "./types";

/** A reserve as a leg names it. */
export interface ReserveRef {
  symbol: string;
  hub: string;
  reserveId: bigint;
}

/**
 * Upper bound on a reserve's relative debt growth from accrued interest during one leg. Even a 100% APR
 * accrues ~1e-5 in five minutes. Only used when the leg's own amount isn't known (the form's Max): the
 * bound scales with the debt already owed, so a small leg on a heavily borrowed reserve can't clear it.
 */
const INTEREST_DRIFT_BOUND = 1e-4;

/**
 * Share of a borrow leg's own amount the reserve's debt must rise by to count as landed. Half leaves room
 * for the form rounding the amount while staying far above any interest drift.
 */
const MIN_LEG_RISE_SHARE = 0.5;

/** A leg's context: the shared run, pinned to one reserve through config overrides. */
export function legContext(
  ctx: ActionContext,
  overrides: Partial<RunConfig>,
): ActionContext {
  return { ...ctx, config: { ...ctx.config, ...overrides } };
}

/** The position's outstanding debt on one reserve, in token units (0 when it owes nothing there). */
export async function readReserveDebt(
  ctx: ActionContext,
  reserveId: bigint,
): Promise<number> {
  const debts = await fetchRepayableDebts(ctx.config.network, ctx.eth.address);
  return debts.find((debt) => debt.reserveId === reserveId)?.debtTokens ?? 0;
}

/**
 * Poll until the leg shows on THIS reserve's on-chain debt: after a borrow, above its pre-leg value by at
 * least a share of `legAmount` (tokens; interest drift when absent or "max"); after a repay, below it.
 */
export async function waitForReserveDebt(
  ctx: ActionContext,
  reserve: ReserveRef,
  before: number,
  direction: "rise" | "fall",
  legAmount?: string,
): Promise<void> {
  const legTokens = legAmount === undefined ? Number.NaN : Number(legAmount);
  const minRise =
    Number.isFinite(legTokens) && legTokens > 0
      ? legTokens * MIN_LEG_RISE_SHARE
      : before * INTEREST_DRIFT_BOUND;
  const landed = (after: number) =>
    direction === "rise" ? after - before > minRise : after < before;
  const deadline = Date.now() + RESERVE_DEBT_VERIFY_TIMEOUT_MS;
  let after = before;
  while (Date.now() < deadline) {
    try {
      after = await readReserveDebt(ctx, reserve.reserveId);
    } catch (error) {
      ctx.log(
        `⚠️ Could not read ${describeReserve(reserve)} debt (${error instanceof Error ? error.message : error}); retrying.`,
      );
    }
    if (landed(after)) {
      ctx.log(
        `✅ ${describeReserve(reserve)} debt ${direction === "rise" ? "rose" : "fell"}: ${before} → ${after} ${reserve.symbol}.`,
      );
      return;
    }
    await ctx.page.waitForTimeout(RESERVE_DEBT_VERIFY_POLL_MS);
  }
  throw new Error(
    `${describeReserve(reserve)} debt did not ${direction} within ${Math.round(RESERVE_DEBT_VERIFY_TIMEOUT_MS / MS_PER_SECOND)}s (before ${before}, last ${after} ${reserve.symbol}) — the leg did not land on this hub's reserve.`,
  );
}
