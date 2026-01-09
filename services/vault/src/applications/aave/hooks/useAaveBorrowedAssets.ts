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

import {
  getCurrencyIconWithFallback,
  getTokenByAddress,
} from "@/services/token/tokenService";
import { formatAmount } from "@/utils/formatting";

import { useAaveConfig } from "../context";
import type { AavePositionWithLiveData, DebtPosition } from "../services";
import type { AaveReserveConfig } from "../services/fetchConfig";

/**
 * Borrowed asset for display
 */
export interface BorrowedAsset {
  /** Token symbol */
  symbol: string;
  /** Display amount (formatted native token amount) */
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
): BorrowedAsset {
  const { reserve, debtPosition } = reserveWithDebt;

  const tokenMetadata = getTokenByAddress(reserve.token.address);
  const symbol = resolveTokenSymbol(tokenMetadata, reserve.token.symbol);
  const icon = getCurrencyIconWithFallback(tokenMetadata?.icon, symbol);

  const tokenAmount = Number(
    formatUnits(debtPosition.totalDebt, reserve.token.decimals),
  );
  const amount = formatAmount(tokenAmount);

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

    const reservesWithDebt: ReserveWithDebt[] = borrowableReserves
      .filter((r) => debtPositions.has(r.reserveId))
      .map((reserve) => ({
        reserve,
        debtPosition: debtPositions.get(reserve.reserveId)!,
      }));

    if (reservesWithDebt.length === 0) {
      return [];
    }

    return reservesWithDebt.map(transformToBorrowedAsset);
  }, [debtPositions, borrowableReserves]);

  return {
    borrowedAssets,
    totalDebtValueUsd: debtValueUsd,
    hasLoans: debtValueUsd > 0,
  };
}
