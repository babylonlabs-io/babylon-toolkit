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
import type { VaultProvider } from "@/types/vaultProvider";
import { toCollateralVaultEntries } from "@/utils/collateral";

// Re-export for consumers
export type { CollateralVaultEntry };

/**
 * Builds a lowercase-address to display-name map from vault providers.
 */
function buildProviderNamesMap(
  providers: VaultProvider[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of providers) {
    if (p.name) {
      map.set(p.id.toLowerCase(), p.name);
    }
  }
  return map;
}

export function useDashboardState(
  connectedAddress: string | undefined,
  vaultProviders?: VaultProvider[],
) {
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

  // Derive a stable key from provider id+name pairs so the memo doesn't
  // recompute when useVaultProviders returns a new array reference (e.g. logo merge).
  const providerKey = useMemo(
    () => (vaultProviders ?? []).map((p) => `${p.id}:${p.name}`).join(","),
    [vaultProviders],
  );

  const providerNames = useMemo(
    () => buildProviderNamesMap(vaultProviders ?? []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [providerKey],
  );

  const collateralVaults = useMemo(
    (): CollateralVaultEntry[] =>
      position?.collaterals
        ? toCollateralVaultEntries(position.collaterals, providerNames)
        : [],
    [position?.collaterals, providerNames],
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
