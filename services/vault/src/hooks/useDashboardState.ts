/**
 * useDashboardState hook
 * Wraps Aave hooks to provide dashboard data.
 * Mirrors the data layer from useAaveOverviewState but scoped to what the dashboard needs.
 */

import { useMemo } from "react";

import {
  useAaveBorrowedAssets,
  useAaveUserPosition,
} from "@/applications/aave/hooks";
import type { Asset } from "@/applications/aave/types";
import type { CollateralVaultEntry } from "@/types/collateral";
import { toCollateralVaultEntries } from "@/utils/collateral";

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

  const hasCollateral = collateralBtc > 0;
  const hasDebt = debtValueUsd > 0;

  const collateralVaults = useMemo(
    (): CollateralVaultEntry[] =>
      position?.collaterals
        ? toCollateralVaultEntries(position.collaterals)
        : [],
    [position?.collaterals],
  );

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
