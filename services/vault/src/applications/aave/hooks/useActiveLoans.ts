/**
 * Merges each borrowed asset with its live per-reserve liquidity/utilization,
 * for the v3 Loans page "Active Loans" rows. Reuses the reserve `reserveId`
 * carried on each `BorrowedAsset` to look up the batched Hub reads from
 * `useAaveReserveLiquidity` — no separate debt derivation.
 */

import { useMemo } from "react";

import { useAaveConfig } from "../context";

import type { BorrowedAsset } from "./useAaveBorrowedAssets";
import { useAaveReserveLiquidity } from "./useAaveReserveLiquidity";

export interface ActiveLoanRow extends BorrowedAsset {
  /** Borrowable liquidity remaining in token units; null while loading/failed. */
  availableLiquidity: number | null;
  /** Utilization in basis points; null at 0 supply or while loading/failed. */
  utilizationBps: number | null;
  /**
   * Whether more can be borrowed from this reserve. Debt surfaces here for the
   * full reserve set (so repay always works), but a reserve that is
   * frozen/paused/un-borrowable is absent from `borrowableReserves` — its
   * Borrow action would dead-end in the reserve-detail form, so gate on this.
   */
  isBorrowable: boolean;
}

export function useActiveLoans(
  borrowedAssets: BorrowedAsset[],
): ActiveLoanRow[] {
  const { allBorrowReserves, borrowableReserves } = useAaveConfig();

  // The reserve configs behind the current debt, needed for the batched
  // liquidity read (keyed by hub/assetId/decimals inside the hook).
  const borrowedReserves = useMemo(() => {
    const borrowedIds = new Set(borrowedAssets.map((a) => a.reserveId));
    return allBorrowReserves.filter((r) =>
      borrowedIds.has(r.reserveId.toString()),
    );
  }, [allBorrowReserves, borrowedAssets]);

  const { liquidityByReserveId } = useAaveReserveLiquidity({
    reserves: borrowedReserves,
  });

  // Reserves that still accept new borrows (the same set the borrow asset
  // picker offers); debt in any other reserve is repay-only.
  const borrowableReserveIds = useMemo(
    () => new Set(borrowableReserves.map((r) => r.reserveId.toString())),
    [borrowableReserves],
  );

  return useMemo(
    () =>
      borrowedAssets.map((asset) => {
        const liquidity = liquidityByReserveId[asset.reserveId] ?? null;
        return {
          ...asset,
          availableLiquidity: liquidity?.availableLiquidity ?? null,
          utilizationBps: liquidity?.utilizationBps ?? null,
          isBorrowable: borrowableReserveIds.has(asset.reserveId),
        };
      }),
    [borrowedAssets, liquidityByReserveId, borrowableReserveIds],
  );
}
