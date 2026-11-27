/**
 * Refetches every signing input from chain at submit time: CF/LB
 * (audit #260), account position, the oracle price, and the Hub's drawn
 * index. Without the
 * fresh oracle read, the React Query cache was the only input that could
 * stay up to 60s stale through a price move.
 */
import type { Address } from "viem";

import { COPY } from "@/copy";
import { ContractError, ErrorCode } from "@/utils/errors";
import { CONTRACT_ERROR_MESSAGES } from "@/utils/errors/errorMessages";

import { getAssetDrawnIndex } from "../../../../clients/aaveHub";
import { getReservesPrices } from "../../../../clients/aaveOracle";
import { BPS_SCALE, MIN_HEALTH_FACTOR_FOR_BORROW } from "../../../../constants";
import type { VaultSplitParams } from "../../../../hooks/useVaultSplitParams";
import type { AavePositionWithLiveData } from "../../../../services";
import { assertCfUnchanged, formatHealthFactor } from "../../../../utils";
import {
  BorrowReserveCapUnavailableError,
  isReserveSelectable,
  toBorrowedReserveIds,
  type BorrowReserveCap,
} from "../../../../utils/borrowReserveLimit";

const WAD = 10n ** 18n;
const RAY = 10n ** 27n;
const MIN_SAFE_HEALTH_FACTOR_WAD = BigInt(
  MIN_HEALTH_FACTOR_FOR_BORROW * Number(WAD),
);

export interface ValidateBorrowPreSignDeps {
  borrowAmountRaw: bigint;
  tokenDecimals: number;
  /** Aave on-chain oracle address (resolved upstream and cached). */
  oracleAddress: Address;
  /** Reserve ID of the borrow asset. */
  reserveId: bigint;
  hub: Address;
  assetId: number;
  safeMode?: boolean;
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

/** Check fresh data and the amount the wallet will sign. */
export async function validateBorrowPreSign({
  borrowAmountRaw,
  tokenDecimals,
  oracleAddress,
  reserveId,
  hub,
  assetId,
  safeMode = true,
  liquidationThresholdBps,
  refetchSplitParams,
  refetchPosition,
  chainMaxBorrowReserves,
}: ValidateBorrowPreSignDeps): Promise<void> {
  if (chainMaxBorrowReserves.status === "unavailable") {
    throw new BorrowReserveCapUnavailableError({
      cause: chainMaxBorrowReserves.error,
    });
  }
  const maxBorrowReserves = chainMaxBorrowReserves.limit;

  // AaveOracle reverts on missing source or non-positive underlying price
  // (`InvalidSource` / `InvalidPrice`). The check below still rejects a
  // missing or non-positive price, and a non-positive drawn index.
  const [
    { freshLiquidationThresholdBps },
    freshPosition,
    freshPriceRaw,
    drawnIndex,
  ] = await Promise.all([
    assertCfUnchanged({ liquidationThresholdBps, refetchSplitParams }),
    refetchPosition(),
    getReservesPrices(oracleAddress, [reserveId]).then(([raw]) => raw),
    getAssetDrawnIndex(hub, assetId),
  ]);

  if (!freshPosition) {
    throw new Error(COPY.loans.borrowPositionUnavailable);
  }
  if (freshPriceRaw === undefined || freshPriceRaw <= 0n || drawnIndex <= 0n) {
    throw new Error(COPY.loans.borrowMarketDataUnavailable);
  }
  if (borrowAmountRaw <= 0n) {
    throw new Error(COPY.loans.borrow.amountTooSmall);
  }

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

  // The Hub rounds new debt shares up. Account values use 26 decimals and
  // oracle prices use 8. Multiply by WAD to convert the price to account units.
  const drawnShares = (borrowAmountRaw * RAY + drawnIndex - 1n) / drawnIndex;
  const tokenScale = 10n ** BigInt(tokenDecimals);
  const addedDebtValueRay =
    (drawnShares * drawnIndex * freshPriceRaw * WAD + tokenScale - 1n) /
    tokenScale;
  const { totalCollateralValue, totalDebtValueRay } = freshPosition.accountData;
  const healthFactorWad =
    (totalCollateralValue * BigInt(freshLiquidationThresholdBps) * RAY * WAD) /
    (BigInt(BPS_SCALE) * (totalDebtValueRay + addedDebtValueRay));

  if (safeMode && healthFactorWad < MIN_SAFE_HEALTH_FACTOR_WAD) {
    throw new Error(
      COPY.loans.borrowHealthFactorChangedError(
        formatHealthFactor(Number(healthFactorWad) / Number(WAD)),
        MIN_HEALTH_FACTOR_FOR_BORROW,
      ),
    );
  }
  if (healthFactorWad <= WAD) {
    throw new Error(COPY.loans.validation.liquidationLimit);
  }
}
