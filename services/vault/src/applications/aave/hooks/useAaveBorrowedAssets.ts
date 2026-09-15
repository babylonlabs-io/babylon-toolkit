/**
 * Hook to fetch user's borrowed assets for the Aave overview page
 *
 * Uses the position data from useAaveUserPosition which already includes
 * debt positions for all borrowable reserves (fetched in a single call).
 *
 * The totalDebt field contains the actual token amount in native decimals,
 * fetched via getUserTotalDebt from the Spoke contract.
 */

import { useMemo } from "react";
import { formatUnits } from "viem";

import { getHubIdentity, type HubIdentity } from "@/services/aave/hubRegistry";
import { formatAmount, formatAprPercent } from "@/utils/formatting";

import { useAaveConfig } from "../context";
import type { AavePositionWithLiveData, DebtPosition } from "../services";
import type { AaveReserveConfig } from "../services/fetchConfig";
import { groupReservesByUnderlying } from "../utils/reserveGroups";
import { getReserveTokenLabel } from "../utils/reserveTokenLabel";

import { useAaveBorrowAprs } from "./useAaveBorrowAprs";

/**
 * Borrowed asset for display
 */
export interface BorrowedAsset {
  /** Reserve ID (`reserveId.toString()`), the key for per-reserve reads such as
   *  liquidity/utilization in `useAaveReserveLiquidity`. */
  reserveId: string;
  /** Token symbol */
  symbol: string;
  /** Full token name (e.g. "USD Coin"); falls back to the symbol. */
  name: string;
  /** Hub the debt is owed to. */
  hub: HubIdentity;
  /** Display amount (formatted native token amount) */
  amount: string;
  /** Token icon URL */
  icon: string;
  /** Borrow APY as a formatted string (e.g. "5.861%"). Undefined only while
   *  the per-reserve APR read (`useAaveBorrowAprs`) hasn't resolved yet. */
  borrowRate?: string;
}

/**
 * Result of useAaveBorrowedAssets hook
 */
export interface UseAaveBorrowedAssetsResult {
  /** Array of borrowed assets */
  borrowedAssets: BorrowedAsset[];
  /** Total debt value in USD */
  totalDebtValueUsd: number;
  /** Whether any loans exist */
  hasLoans: boolean;
}

/**
 * Props for useAaveBorrowedAssets hook
 */
interface UseAaveBorrowedAssetsProps {
  /** User's position with live data (from useAaveUserPosition) */
  position: AavePositionWithLiveData | null;
  /** Total debt value in USD (from useAaveUserPosition) */
  debtValueUsd: number;
}

/**
 * Reserve with its associated debt position
 */
interface ReserveWithDebt {
  reserve: AaveReserveConfig;
  debtPosition: DebtPosition;
}

/**
 * Transform a reserve with debt into a display-ready BorrowedAsset
 */
function transformToBorrowedAsset(
  reserveWithDebt: ReserveWithDebt,
  aprPercent: number | null | undefined,
): BorrowedAsset {
  const { reserve, debtPosition } = reserveWithDebt;

  const { symbol, name, icon } = getReserveTokenLabel(reserve);

  const tokenAmount = Number(
    formatUnits(debtPosition.totalDebt, reserve.token.decimals),
  );
  const amount = formatAmount(tokenAmount, reserve.token.decimals);
  const borrowRate =
    aprPercent != null ? formatAprPercent(aprPercent) : undefined;

  return {
    reserveId: reserve.reserveId.toString(),
    symbol,
    name,
    hub: getHubIdentity(reserve.reserve.hub),
    amount,
    icon,
    borrowRate,
  };
}

/**
 * Hook to derive borrowed assets from position data
 *
 * Uses the debtPositions already fetched by useAaveUserPosition,
 * avoiding separate RPC calls.
 *
 * @param props - Position and debt data from useAaveUserPosition
 * @returns Borrowed assets data for display
 */
export function useAaveBorrowedAssets({
  position,
  debtValueUsd,
}: UseAaveBorrowedAssetsProps): UseAaveBorrowedAssetsResult {
  const { allBorrowReserves } = useAaveConfig();

  const debtPositions = position?.debtPositions;

  // Resolve debts against the full reserve set, not just borrowable ones, so
  // existing debt in a frozen/paused/un-borrowable reserve still surfaces.
  // Grouped by token so one token's debts on different hubs sit together.
  const reservesWithDebt = useMemo((): ReserveWithDebt[] => {
    if (!debtPositions || debtPositions.size === 0) {
      return [];
    }
    return groupReservesByUnderlying(
      allBorrowReserves.filter((r) => debtPositions.has(r.reserveId)),
    )
      .flatMap((group) => group.reserves)
      .map((reserve) => ({
        reserve,
        debtPosition: debtPositions.get(reserve.reserveId)!,
      }));
  }, [debtPositions, allBorrowReserves]);

  const reservesOnly = useMemo(
    () => reservesWithDebt.map((r) => r.reserve),
    [reservesWithDebt],
  );
  const { aprPercentByReserveId } = useAaveBorrowAprs({
    reserves: reservesOnly,
  });

  const borrowedAssets = useMemo(
    (): BorrowedAsset[] =>
      reservesWithDebt.map((rwd) =>
        transformToBorrowedAsset(
          rwd,
          aprPercentByReserveId[rwd.reserve.reserveId.toString()],
        ),
      ),
    [reservesWithDebt, aprPercentByReserveId],
  );

  return {
    borrowedAssets,
    totalDebtValueUsd: debtValueUsd,
    hasLoans: debtValueUsd > 0,
  };
}
