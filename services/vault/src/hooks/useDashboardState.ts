/**
 * useDashboardState hook
 * Wraps Aave hooks to provide dashboard data.
 * Mirrors the data layer from useAaveOverviewState but scoped to what the dashboard needs.
 */

import { useEffect, useMemo } from "react";
import type { Hex } from "viem";

import { useReorderOverride } from "@/applications/aave/context";
import {
  useAaveBorrowedAssets,
  useAaveUserPosition,
} from "@/applications/aave/hooks";
import type { Asset } from "@/applications/aave/types";
import { useVaultProviders } from "@/hooks/deposit/useVaultProviders";
import type { CollateralVaultEntry } from "@/types/collateral";
import { toCollateralVaultEntries } from "@/utils/collateral";

// Re-export for consumers
export type { CollateralVaultEntry };

/** Entries ordered ascending by the indexer's liquidationIndex (default order). */
function byLiquidationIndex(
  entries: CollateralVaultEntry[],
): CollateralVaultEntry[] {
  return [...entries].sort((a, b) => a.liquidationIndex - b.liquidationIndex);
}

/** Whether `order` is exactly the set of vault IDs in `entries`. */
function orderMatchesEntrySet(
  entries: CollateralVaultEntry[],
  order: readonly Hex[],
): boolean {
  if (order.length !== entries.length) return false;
  const ids = new Set(entries.map((e) => e.vaultId.toLowerCase()));
  return (
    ids.size === order.length && order.every((id) => ids.has(id.toLowerCase()))
  );
}

/**
 * Sort entries by the post-reorder submitted order so the new order shows
 * immediately. Also rewrites each entry's `liquidationIndex` to its rank in the
 * override, so the per-row "Liquidation Order" ordinal matches the displayed
 * position (otherwise rows would show stale indexer ordinals during the
 * reconciliation window). Falls back to the indexer's liquidationIndex when
 * there is no override or it no longer describes the same vault set (e.g. a
 * vault was withdrawn since).
 */
function sortByReorderedOverride(
  entries: CollateralVaultEntry[],
  order: readonly Hex[] | null,
): CollateralVaultEntry[] {
  if (!order || !orderMatchesEntrySet(entries, order)) {
    return byLiquidationIndex(entries);
  }
  const rank = new Map<string, number>();
  order.forEach((id, i) => rank.set(id.toLowerCase(), i));
  return entries
    .map((entry) => ({
      ...entry,
      liquidationIndex: rank.get(entry.vaultId.toLowerCase())!,
    }))
    .sort((a, b) => a.liquidationIndex - b.liquidationIndex);
}

/**
 * Whether the override should be dropped — true when there is no override, when
 * it no longer matches the vault set, or when the indexer's liquidationIndex
 * order already equals the override.
 */
function isReorderOverrideReconciled(
  entries: CollateralVaultEntry[],
  order: readonly Hex[] | null,
): boolean {
  if (!order) return true;
  if (!orderMatchesEntrySet(entries, order)) return true;
  return byLiquidationIndex(entries).every(
    (e, i) => e.vaultId.toLowerCase() === order[i].toLowerCase(),
  );
}

export function useDashboardState(connectedAddress: string | undefined) {
  const {
    position,
    collateralBtc,
    collateralValueUsd,
    debtValueUsd,
    healthFactor,
    healthFactorStatus,
    isLoading,
  } = useAaveUserPosition(connectedAddress);

  const { borrowedAssets, hasLoans } = useAaveBorrowedAssets({
    position,
    debtValueUsd,
  });

  const { findProvider } = useVaultProviders();
  const { reorderedOrder, clearReorderedOrder } = useReorderOverride();

  const hasCollateral = collateralBtc > 0;
  const hasDebt = debtValueUsd > 0;

  // Raw indexer entries (liquidationIndex straight from the indexer). These
  // drive reconciliation — they reflect what the indexer currently believes,
  // independent of any active override.
  const rawCollateralVaults = useMemo(
    (): CollateralVaultEntry[] =>
      position?.collaterals
        ? toCollateralVaultEntries(position.collaterals, findProvider)
        : [],
    [position?.collaterals, findProvider],
  );

  // Displayed entries. Normally indexer-ordered; right after a reorder,
  // `reorderedOrder` holds the submitted order so the new order (and each row's
  // ordinal) shows immediately. Falls back to indexer ordering once the
  // override no longer matches the vault set.
  const collateralVaults = useMemo(
    (): CollateralVaultEntry[] =>
      sortByReorderedOverride(rawCollateralVaults, reorderedOrder),
    [rawCollateralVaults, reorderedOrder],
  );

  // Drop the override once the indexer reflects the reordered sequence (or the
  // vault set changed), handing display back to the indexer ordering. Compares
  // against the raw indexer entries, not the override-rewritten ones.
  useEffect(() => {
    if (!reorderedOrder) return;
    if (isReorderOverrideReconciled(rawCollateralVaults, reorderedOrder)) {
      clearReorderedOrder();
    }
  }, [rawCollateralVaults, reorderedOrder, clearReorderedOrder]);

  // Transform borrowed assets for the asset selection modal
  const selectableBorrowedAssets = useMemo(
    (): Asset[] =>
      borrowedAssets.map((asset) => ({
        symbol: asset.symbol,
        name: asset.symbol,
        icon: asset.icon,
      })),
    [borrowedAssets],
  );

  return {
    collateralBtc,
    collateralValueUsd,
    debtValueUsd,
    healthFactor,
    healthFactorStatus,
    borrowedAssets,
    hasLoans,
    hasCollateral,
    hasDebt,
    collateralVaults,
    selectableBorrowedAssets,
    isLoading,
  };
}
