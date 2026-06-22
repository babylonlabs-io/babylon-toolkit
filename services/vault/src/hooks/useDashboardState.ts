/**
 * useDashboardState hook
 * Wraps Aave hooks to provide dashboard data.
 * Mirrors the data layer from useAaveOverviewState but scoped to what the dashboard needs.
 */

import { useEffect, useMemo } from "react";

import {
  useActivatingVaults,
  useReorderOverride,
} from "@/applications/aave/context";
import {
  useAaveBorrowedAssets,
  useAaveUserPosition,
} from "@/applications/aave/hooks";
import type { Asset } from "@/applications/aave/types";
import { useVaultProviders } from "@/hooks/deposit/useVaultProviders";
import type { CollateralVaultEntry } from "@/types/collateral";
import { truncateHash } from "@/utils/addressUtils";
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
  const { activatingVaults, clearActivatingVault } = useActivatingVaults();

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

  // Optimistic "Activating…" rows: just-activated vaults the indexer hasn't
  // ingested yet. Excludes any vault already present in the indexer entries so
  // we never duplicate a row once it lands.
  const activatingEntries = useMemo((): CollateralVaultEntry[] => {
    if (activatingVaults.size === 0) return [];
    const indexedIds = new Set(
      rawCollateralVaults.map((v) => v.vaultId.toLowerCase()),
    );
    return Array.from(activatingVaults.values())
      .filter((entry) => !indexedIds.has(entry.vaultId.toLowerCase()))
      .map((entry): CollateralVaultEntry => {
        const provider = findProvider?.(entry.providerAddress ?? "");
        return {
          id: `activating-${entry.vaultId}`,
          vaultId: entry.vaultId,
          amountBtc: entry.amountBtc,
          addedAt: 0,
          inUse: false,
          isActivating: true,
          providerAddress: entry.providerAddress ?? "",
          providerName:
            provider?.name ?? truncateHash(entry.providerAddress ?? ""),
          providerIconUrl: provider?.iconUrl,
          // No indexed liquidation order yet; sentinel keeps it last if sorted.
          liquidationIndex: Number.MAX_SAFE_INTEGER,
        };
      });
  }, [activatingVaults, rawCollateralVaults, findProvider]);

  // Displayed entries. Normally indexer-ordered; right after a reorder,
  // `reorderedOrder` holds the submitted order so the new order (and each row's
  // ordinal) shows immediately. Falls back to indexer ordering once the
  // override no longer matches the vault set. Optimistic activating rows are
  // appended last, until the indexer reflects them.
  const collateralVaults = useMemo(
    (): CollateralVaultEntry[] => [
      ...sortByReorderedOverride(rawCollateralVaults, reorderedOrder),
      ...activatingEntries,
    ],
    [rawCollateralVaults, reorderedOrder, activatingEntries],
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

  // Drop each activating override once the indexer reflects that vault, so the
  // optimistic row hands off to the real indexer-driven row without duplicating.
  useEffect(() => {
    if (activatingVaults.size === 0) return;
    const indexedIds = new Set(
      rawCollateralVaults.map((v) => v.vaultId.toLowerCase()),
    );
    for (const entry of activatingVaults.values()) {
      if (indexedIds.has(entry.vaultId.toLowerCase())) {
        clearActivatingVault(entry.vaultId);
      }
    }
  }, [rawCollateralVaults, activatingVaults, clearActivatingVault]);

  // Display-only BTC total: indexer collateral plus optimistic activating
  // amounts. The financial `collateralBtc` (health factor / withdraw math)
  // stays indexer/oracle-pure and is returned unchanged below.
  const displayCollateralBtc =
    collateralBtc +
    activatingEntries.reduce((sum, entry) => sum + entry.amountBtc, 0);

  // Financial gate — drives action-enabling (e.g. Borrow). Indexer-pure: an
  // optimistic activating row must NOT unlock financial actions before the
  // collateral actually exists on-chain.
  const hasCollateral = collateralBtc > 0;
  // Display gate — drives the Collateral section's summary-vs-empty rendering,
  // so the just-activated vault shows during the indexer gap.
  const hasDisplayCollateral =
    collateralBtc > 0 || activatingEntries.length > 0;

  // Transform borrowed assets for the asset selection modal
  const selectableBorrowedAssets = useMemo(
    (): Asset[] =>
      borrowedAssets.map((asset) => ({
        symbol: asset.symbol,
        name: asset.name,
        icon: asset.icon,
      })),
    [borrowedAssets],
  );

  return {
    collateralBtc,
    displayCollateralBtc,
    collateralValueUsd,
    debtValueUsd,
    healthFactor,
    healthFactorStatus,
    borrowedAssets,
    hasLoans,
    hasCollateral,
    hasDisplayCollateral,
    hasDebt,
    collateralVaults,
    selectableBorrowedAssets,
    isLoading,
  };
}
