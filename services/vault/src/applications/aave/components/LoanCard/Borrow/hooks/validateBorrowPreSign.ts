/**
 * Refetches every signing input from chain at submit time: CF/LB
 * (audit #260), account position, and the oracle price. Without the
 * fresh oracle read, the React Query cache was the only input that could
 * stay up to 60s stale through a price move.
 */
import type { Address } from "viem";

import { ContractError, ErrorCode } from "@/utils/errors";
import { CONTRACT_ERROR_MESSAGES } from "@/utils/errors/errorMessages";

import { getReservesPrices } from "../../../../clients/aaveOracle";
import { MIN_HEALTH_FACTOR_FOR_BORROW } from "../../../../constants";
import type { VaultSplitParams } from "../../../../hooks/useVaultSplitParams";
import type { AavePositionWithLiveData } from "../../../../services";
import {
  aaveRayValueToUsd,
  aaveValueToUsd,
  assertCfUnchanged,
  calculateHealthFactor,
} from "../../../../utils";
import {
  BorrowReserveCapUnavailableError,
  isReserveSelectable,
  toBorrowedReserveIds,
  type BorrowReserveCap,
} from "../../../../utils/borrowReserveLimit";

/** Aave oracle base unit (Spoke.ORACLE_DECIMALS = 8). */
const ORACLE_SCALE = 1e8;

export interface ValidateBorrowPreSignDeps {
  borrowAmount: number;
  /** Aave on-chain oracle address (resolved upstream and cached). */
  oracleAddress: Address;
  /** Reserve ID of the borrow asset. */
  reserveId: bigint;
  /**
   * Liquidation threshold (in BPS) the user saw on the displayed metrics.
   * Compared against the freshly-fetched value to detect on-chain CF moves
   * since the screen was rendered.
   */
  liquidationThresholdBps: number;
  refetchSplitParams: () => Promise<VaultSplitParams | null>;
  refetchPosition: () => Promise<AavePositionWithLiveData | null>;
  /**
   * The Spoke's own borrow-reserve cap, never the god-mode override: the gate
   * must refuse exactly what the chain would revert.
   */
  chainMaxBorrowReserves: BorrowReserveCap;
}

/** Throws if the projected post-borrow HF would fall below MIN_HEALTH_FACTOR_FOR_BORROW, or any input is stale/missing. */
export async function validateBorrowPreSign({
  borrowAmount,
  oracleAddress,
  reserveId,
  liquidationThresholdBps,
  refetchSplitParams,
  refetchPosition,
  chainMaxBorrowReserves,
}: ValidateBorrowPreSignDeps): Promise<void> {
  // Ahead of every read and of the first-borrow early return: without the cap
  // there is no way to tell whether the Spoke would accept this reserve.
  if (chainMaxBorrowReserves.status === "unavailable") {
    throw new BorrowReserveCapUnavailableError({
      cause: chainMaxBorrowReserves.error,
    });
  }
  const maxBorrowReserves = chainMaxBorrowReserves.limit;

  // AaveOracle reverts on missing source or non-positive underlying price
  // (`InvalidSource` / `InvalidPrice`), so a returned value is always > 0.
  const [{ freshLiquidationThresholdBps }, freshPosition, freshPriceRaw] =
    await Promise.all([
      assertCfUnchanged({ liquidationThresholdBps, refetchSplitParams }),
      refetchPosition(),
      getReservesPrices(oracleAddress, [reserveId]).then(([raw]) => raw),
    ]);

  const freshTokenPriceUsd = Number(freshPriceRaw) / ORACLE_SCALE;

  if (!freshPosition) return; // No position = first borrow, skip revalidation

  // The pickers grey out a reserve the Spoke would reject, but the market
  // page's Borrow action, the in-form asset dropdown and a pasted reserve link
  // all open this form directly. This is the one boundary every borrow crosses,
  // and it already holds a fresh position, so the cap is checked here too.
  // Matches the Spoke's own criterion: it stops counting a reserve as borrowed
  // at `drawnShares == 0`, while a premium-only residue keeps a debt position.
  if (
    maxBorrowReserves !== null &&
    !isReserveSelectable(
      {
        limit: maxBorrowReserves,
        borrowCount: freshPosition.accountData.borrowCount,
        borrowedReserveIds: toBorrowedReserveIds(freshPosition.debtPositions),
      },
      reserveId,
    )
  ) {
    // The same error the Spoke reverts with, so the borrow hook renders the
    // one sentence for this condition, with no "Borrow failed:" prefix.
    throw new ContractError(
      CONTRACT_ERROR_MESSAGES.MaximumUserReservesExceeded,
      ErrorCode.CONTRACT_REVERT,
      undefined,
      "MaximumUserReservesExceeded",
    );
  }

  const freshCollateralUsd = aaveValueToUsd(
    freshPosition.accountData.totalCollateralValue,
  );
  const freshDebtUsd = aaveRayValueToUsd(
    freshPosition.accountData.totalDebtValueRay,
  );
  const projectedDebtUsd = freshDebtUsd + borrowAmount * freshTokenPriceUsd;
  const projectedHF = calculateHealthFactor(
    freshCollateralUsd,
    projectedDebtUsd,
    freshLiquidationThresholdBps,
  );

  if (isFinite(projectedHF) && projectedHF < MIN_HEALTH_FACTOR_FOR_BORROW) {
    throw new Error(
      `Position data has changed. Projected health factor (${projectedHF.toFixed(2)}) ` +
        `would be below ${MIN_HEALTH_FACTOR_FOR_BORROW}. Please reduce the borrow amount.`,
    );
  }
}
