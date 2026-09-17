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
 * accrues ~1e-5 in five minutes. It bounds interest on debt already owed in two places: a "rise" check
 * falls back to it when the leg's own amount isn't known (the form's Max), where it scales with the debt
 * already owed and so can miss a small leg on a heavily borrowed reserve; and a reserve within it of its
 * pre-run debt counts as cleared.
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

/** How a leg's on-chain debt must move for the leg to count as landed. */
type DebtDirection = "rise" | "fall" | "clear";

/** Log wording once a leg's debt has moved as required. */
const DEBT_LANDED: Record<DebtDirection, string> = {
  rise: "rose",
  fall: "fell",
  clear: "is back to its pre-run level",
};

/** Timeout wording, including what a miss means for that direction. */
const DEBT_MISSED: Record<DebtDirection, string> = {
  rise: "did not rise — the leg did not land on this hub's reserve",
  fall: "did not fall — the leg did not land on this hub's reserve",
  clear:
    "did not return to its pre-run level — the repay did not clear the debt this run created",
};

/** Whether `debt` is above `baseline` by more than interest drift on that baseline. */
function owesMoreThan(debt: number, baseline: number): boolean {
  return debt > baseline * (1 + INTEREST_DRIFT_BOUND);
}

/**
 * Poll until the leg shows on THIS reserve's on-chain debt:
 *   - "rise" (after a borrow): above `before` by at least a share of `legAmount` (tokens; interest drift
 *     when absent or "max");
 *   - "fall" (after a repay): below `before`;
 *   - "clear" (after a full repay): at or below `before`, here the reserve's debt before this run borrowed
 *     from it, allowing for interest drift on debt that was already there.
 */
export async function waitForReserveDebt(
  ctx: ActionContext,
  reserve: ReserveRef,
  before: number,
  direction: DebtDirection,
  legAmount?: string,
): Promise<void> {
  const legTokens = legAmount === undefined ? Number.NaN : Number(legAmount);
  const minRise =
    Number.isFinite(legTokens) && legTokens > 0
      ? legTokens * MIN_LEG_RISE_SHARE
      : before * INTEREST_DRIFT_BOUND;
  const landed = (after: number) => {
    if (direction === "rise") return after - before > minRise;
    if (direction === "fall") return after < before;
    return !owesMoreThan(after, before);
  };
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
        `✅ ${describeReserve(reserve)} debt ${DEBT_LANDED[direction]}: ${before} → ${after} ${reserve.symbol}.`,
      );
      return;
    }
    await ctx.page.waitForTimeout(RESERVE_DEBT_VERIFY_POLL_MS);
  }
  throw new Error(
    `${describeReserve(reserve)} debt ${DEBT_MISSED[direction]} (within ${Math.round(RESERVE_DEBT_VERIFY_TIMEOUT_MS / MS_PER_SECOND)}s; before ${before}, last ${after} ${reserve.symbol}).`,
  );
}

/** A leg's recorded pre-run debt. Throws when the run never recorded one, rather than assuming zero. */
export function baselineOf(
  baselines: ReadonlyMap<bigint, number>,
  reserve: ReserveRef,
): number {
  const baseline = baselines.get(reserve.reserveId);
  if (baseline === undefined)
    throw new Error(
      `No pre-run debt recorded for ${describeReserve(reserve)} — cannot tell whether this run's debt is cleared.`,
    );
  return baseline;
}

/**
 * The reserves that still owe more than before this run borrowed from them (beyond interest drift), from
 * one on-chain read. `null` when that read fails, so the caller can say the debt could not be checked.
 */
export async function readReservesStillOwed<R extends ReserveRef>(
  ctx: ActionContext,
  reserves: R[],
  baselines: ReadonlyMap<bigint, number>,
): Promise<R[] | null> {
  let debts;
  try {
    debts = await fetchRepayableDebts(ctx.config.network, ctx.eth.address);
  } catch (error) {
    ctx.log(
      `⚠️ Could not re-read outstanding debt (${error instanceof Error ? error.message : error}).`,
    );
    return null;
  }
  return reserves.filter((reserve) => {
    // A reserve missing from the list owes nothing, as in readReserveDebt.
    const debt =
      debts.find((d) => d.reserveId === reserve.reserveId)?.debtTokens ?? 0;
    return owesMoreThan(debt, baselineOf(baselines, reserve));
  });
}
