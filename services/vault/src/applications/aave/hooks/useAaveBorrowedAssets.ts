/**
 * Hook to fetch user's borrowed assets for the Aave overview page
 *
 * Uses the position data from useAaveUserPosition which already includes
 * debt positions for all borrowable reserves (fetched in a single call).
 *
 * Since converting drawnShares to exact token amounts requires Hub contract
 * interaction (not currently available), we use the aggregate totalDebtValue
 * from getUserAccountData and distribute it proportionally based on debt shares.
 */

import { useMemo } from "react";

import {
  getCurrencyIconWithFallback,
  getTokenByAddress,
} from "@/services/token/tokenService";
import { formatUsdValue } from "@/utils/formatting";

import { useAaveConfig } from "../context";
import type { AavePositionWithLiveData, DebtPosition } from "../services";
import type { AaveReserveConfig } from "../services/fetchConfig";

/**
 * Borrowed asset for display
 */
export interface BorrowedAsset {
  /** Token symbol */
  symbol: string;
  /** Display amount (formatted USD value) */
  amount: string;
  /** Token icon URL */
  icon: string;
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
 * Get total debt shares for a position (drawn + premium/interest)
 */
function getTotalDebtShares(debtPosition: DebtPosition): bigint {
  return debtPosition.drawnShares + debtPosition.premiumShares;
}

/**
 * Calculate total shares across all debt positions
 */
function calculateTotalShares(reservesWithDebt: ReserveWithDebt[]): bigint {
  return reservesWithDebt.reduce(
    (sum, { debtPosition }) => sum + getTotalDebtShares(debtPosition),
    0n,
  );
}

/**
 * Calculate proportional debt value for a reserve based on its share of total debt
 */
function calculateProportionalDebtValue(
  reserveShares: bigint,
  totalShares: bigint,
  totalDebtValueUsd: number,
): number {
  if (totalShares === 0n) return 0;
  return (totalDebtValueUsd * Number(reserveShares)) / Number(totalShares);
}

/**
 * Resolve token symbol from metadata or indexer data
 * Falls back to "Unknown" if symbol looks like an address
 */
function resolveTokenSymbol(
  tokenMetadata: ReturnType<typeof getTokenByAddress>,
  indexerSymbol: string,
): string {
  // Check if registry has valid symbol (not an address)
  if (tokenMetadata && !tokenMetadata.symbol.startsWith("0x")) {
    return tokenMetadata.symbol;
  }

  // Check if indexer symbol looks like an address
  const isSymbolAnAddress =
    indexerSymbol.startsWith("0x") && indexerSymbol.length > 10;

  return isSymbolAnAddress ? "Unknown" : indexerSymbol;
}

/**
 * Transform a reserve with debt into a display-ready BorrowedAsset
 */
function transformToBorrowedAsset(
  reserveWithDebt: ReserveWithDebt,
  totalShares: bigint,
  totalDebtValueUsd: number,
): BorrowedAsset {
  const { reserve, debtPosition } = reserveWithDebt;

  const tokenMetadata = getTokenByAddress(reserve.token.address);
  const symbol = resolveTokenSymbol(tokenMetadata, reserve.token.symbol);
  const icon = getCurrencyIconWithFallback(tokenMetadata?.icon, symbol);

  const reserveShares = getTotalDebtShares(debtPosition);
  const debtValue = calculateProportionalDebtValue(
    reserveShares,
    totalShares,
    totalDebtValueUsd,
  );
  const amount = formatUsdValue(debtValue).replace("$", "");

  return { symbol, amount, icon };
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
  const { borrowableReserves } = useAaveConfig();

  const debtPositions = position?.debtPositions;

  const borrowedAssets = useMemo((): BorrowedAsset[] => {
    if (!debtPositions || debtPositions.size === 0) {
      return [];
    }

    // Match reserves with their debt positions
    const reservesWithDebt: ReserveWithDebt[] = borrowableReserves
      .filter((r) => debtPositions.has(r.reserveId))
      .map((reserve) => ({
        reserve,
        debtPosition: debtPositions.get(reserve.reserveId)!,
      }));

    if (reservesWithDebt.length === 0) {
      return [];
    }

    const totalShares = calculateTotalShares(reservesWithDebt);

    return reservesWithDebt.map((reserveWithDebt) =>
      transformToBorrowedAsset(reserveWithDebt, totalShares, debtValueUsd),
    );
  }, [debtPositions, borrowableReserves, debtValueUsd]);

  return {
    borrowedAssets,
    totalDebtValueUsd: debtValueUsd,
    hasLoans: debtValueUsd > 0,
  };
}
