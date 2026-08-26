/**
 * Submit-time freshness check + repay-mode selection.
 *
 * Called by the Repay submit path when the user has signaled Max intent.
 * Refetches debt + balance on-chain (synchronously, awaiting the network),
 * then picks the repay path that actually clears the debt:
 *
 *   - balance ≥ debt → `"max"`     (repayAll: repay-all sentinel, approval
 *                                    capped at min(fee-inclusive quote +
 *                                    buffer, balance); clears the debt.
 *                                    Edge: this compares the fee-EXCLUSIVE
 *                                    Spoke debt — if the balance can't also
 *                                    cover the adapter fee, repayAll
 *                                    pre-throws an actionable error)
 *   - balance < debt → `"partial"` (send full balance)
 *
 * Doing this at submit (not at Max-button click) avoids the stale-snapshot
 * window between click and submit — the bigint we feed into `repayAll`
 * is read from chain in the same tick we ask the wallet to sign.
 */
import type { QueryObserverResult } from "@tanstack/react-query";
import { formatUnits } from "viem";

import { COPY } from "@/copy";
import { logger } from "@/infrastructure";

import type { RepayMode } from "../../../../hooks/useRepayTransaction";
import type { AavePositionWithLiveData } from "../../../../services";

/**
 * Refetch position data — already unwraps the React Query result and throws
 * on `isError`, matching the shape exposed by `useAaveUserPosition.refetch`.
 */
type RefetchPosition = () => Promise<AavePositionWithLiveData | null>;

/**
 * Refetch user balance — returns the raw React Query result so the caller
 * can inspect `isError` (matches `useERC20Balance.refetch`).
 */
type RefetchUserBalance = () => Promise<QueryObserverResult<bigint, Error>>;

export interface PickRepayParamsArgs {
  refetchPosition: RefetchPosition;
  refetchUserBalance: RefetchUserBalance;
  reserveId: bigint;
  tokenDecimals: number;
}

export type PickRepayParamsResult =
  | {
      kind: "ok";
      mode: RepayMode;
      amount: number;
      /** Exact bigint balance — required by `repayAll`, null otherwise. */
      amountRaw: bigint | null;
    }
  | {
      kind: "error";
      message: string;
    };

export async function pickRepayParams({
  refetchPosition,
  refetchUserBalance,
  reserveId,
  tokenDecimals,
}: PickRepayParamsArgs): Promise<PickRepayParamsResult> {
  let freshDebtAmount: number;
  let freshDebtRaw: bigint;
  let freshBalanceAmount: number;
  let freshBalanceRaw: bigint;

  try {
    const [freshPosition, freshBalanceResult] = await Promise.all([
      refetchPosition(),
      refetchUserBalance(),
    ]);

    // `refetchUserBalance` is the raw React Query refetch — it resolves with
    // a result object even on failure. Treat `isError` as a thrown error.
    if (freshBalanceResult.isError) {
      throw freshBalanceResult.error ?? new Error("Balance refetch failed");
    }

    freshDebtRaw =
      freshPosition?.debtPositions?.get(reserveId)?.totalDebt ?? 0n;
    freshDebtAmount = Number(formatUnits(freshDebtRaw, tokenDecimals));
    freshBalanceRaw = freshBalanceResult.data ?? 0n;
    freshBalanceAmount = Number(formatUnits(freshBalanceRaw, tokenDecimals));
  } catch (error) {
    logger.warn("Repay submit refetch failed", {
      data: {
        context: "Aave repay submit (Max intent)",
        error: error instanceof Error ? error.message : String(error),
      },
    });
    return { kind: "error", message: COPY.loans.repay.refetchError };
  }

  if (freshDebtAmount <= 0 || freshBalanceAmount <= 0) {
    return {
      kind: "ok",
      mode: "partial",
      amount: Math.min(freshDebtAmount, freshBalanceAmount),
      amountRaw: null,
    };
  }

  // Compare raw bigints, not the rounded JS numbers: at 18 decimals a balance
  // one base unit below the debt rounds equal, and the sentinel repays the
  // full debt while the approval is balance-capped — which would revert.
  // Reported `amount` is the debt (what actually gets cleared — feeds the
  // success toast); `amountRaw` is the balance (caps the approval).
  if (freshBalanceRaw >= freshDebtRaw) {
    return {
      kind: "ok",
      mode: "max",
      amount: freshDebtAmount,
      amountRaw: freshBalanceRaw,
    };
  }
  return {
    kind: "ok",
    mode: "partial",
    amount: freshBalanceAmount,
    amountRaw: null,
  };
}
