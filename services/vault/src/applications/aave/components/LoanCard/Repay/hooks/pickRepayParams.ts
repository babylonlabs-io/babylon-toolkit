/**
 * Submit-time freshness check + repay-mode selection.
 *
 * Called by the Repay submit path when the user has signaled Max intent.
 * Refetches debt + balance on-chain (synchronously, awaiting the network),
 * then picks the cheapest repay path that actually clears the debt:
 *
 *   - balance ≥ debt × (1 + buffer)   → `"full"`     (repayFull adds buffer)
 *   - debt ≤ balance < debt × (1+buf) → `"max-capped"` (approve full balance,
 *                                       send repay-all sentinel; clears debt)
 *   - balance < debt                  → `"partial"`  (send full balance)
 *
 * Doing this at submit (not at Max-button click) avoids the stale-snapshot
 * window between click and submit — the bigint we feed into `repayMaxCapped`
 * is read from chain in the same tick we ask the wallet to sign.
 */
import type { QueryObserverResult } from "@tanstack/react-query";
import { formatUnits } from "viem";

import { logger } from "@/infrastructure";

import { FULL_REPAY_BUFFER_FRACTION } from "../../../../constants";
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
      /** Exact bigint balance — required by `repayMaxCapped`, null otherwise. */
      amountRaw: bigint | null;
    }
  | {
      kind: "error";
      message: string;
    };

const REFETCH_ERROR_MESSAGE =
  "Couldn't refresh balance/debt — please try again.";

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
    return { kind: "error", message: REFETCH_ERROR_MESSAGE };
  }

  if (freshDebtAmount <= 0 || freshBalanceAmount <= 0) {
    return {
      kind: "ok",
      mode: "partial",
      amount: Math.min(freshDebtAmount, freshBalanceAmount),
      amountRaw: null,
    };
  }

  const fullRepayThreshold = freshDebtAmount * (1 + FULL_REPAY_BUFFER_FRACTION);

  if (freshBalanceAmount >= fullRepayThreshold) {
    return {
      kind: "ok",
      mode: "full",
      amount: freshDebtAmount,
      amountRaw: null,
    };
  }
  // Compare raw bigints, not the rounded JS numbers: at 18 decimals a balance
  // one base unit below the debt rounds equal, and max-capped's sentinel repays
  // the full debt while approving only the balance — which would revert.
  if (freshBalanceRaw >= freshDebtRaw) {
    return {
      kind: "ok",
      mode: "max-capped",
      amount: freshBalanceAmount,
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
