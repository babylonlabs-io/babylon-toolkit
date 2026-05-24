/**
 * useDashboardState hook
 * Wraps Aave hooks to provide dashboard data.
 * Mirrors the data layer from useAaveOverviewState but scoped to what the dashboard needs.
 */

import { useEffect, useMemo } from "react";

import { useReorderOverride } from "@/applications/aave/context";
import {
  useAaveBorrowedAssets,
  useAaveUserPosition,
} from "@/applications/aave/hooks";
import type { Asset } from "@/applications/aave/types";
import { useVaultProviders } from "@/hooks/deposit/useVaultProviders";
import type { CollateralVaultEntry } from "@/types/collateral";
import { toCollateralVaultEntries } from "@/utils/collateral";
import {
  isReorderOverrideReconciled,
  sortByReorderedOverride,
} from "@/utils/collateralOrder";

// Re-export for consumers
export type { CollateralVaultEntry };

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
