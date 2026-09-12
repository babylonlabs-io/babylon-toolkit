/**
 * useDashboardState hook
 * Wraps Aave hooks to provide dashboard data.
 * Mirrors the data layer from useAaveOverviewState but scoped to what the dashboard needs.
 */

import { useEffect, useMemo } from "react";

import { BPS_SCALE, MIN_BORROWABLE_USD } from "@/applications/aave/constants";
import {
  useActivatingVaults,
  usePendingVaults,
  useReorderOverride,
} from "@/applications/aave/context";
import {
  useAaveBorrowedAssets,
  useAaveUserPosition,
  useVaultSplitParams,
} from "@/applications/aave/hooks";
import { calculateBorrowCapacityUsd } from "@/applications/aave/utils";
import { useVaultProviders } from "@/hooks/deposit/useVaultProviders";
import type { CollateralVaultEntry } from "@/types/collateral";
import { truncateHash } from "@/utils/addressUtils";
import {
  applyPendingWithdrawals,
  toCollateralVaultEntries,
} from "@/utils/collateral";
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
    error: positionError,
    refetch: refetchPosition,
  } = useAaveUserPosition(connectedAddress);

  const { borrowedAssets, hasLoans } = useAaveBorrowedAssets({
    position,
    debtValueUsd,
  });

  const {
    params: splitParams,
    isLoading: isBorrowCapacityLoading,
    error: borrowCapacityError,
  } = useVaultSplitParams(connectedAddress);
  const liquidationThresholdBps = splitParams
    ? Math.round(splitParams.CF * BPS_SCALE)
    : 0;
  const { availableToBorrowUsd } = calculateBorrowCapacityUsd({
    collateralValueUsd,
    currentDebtUsd: debtValueUsd,
    liquidationThresholdBps,
  });

  // Borrow is offered only with at least a cent of headroom. A fully-borrowed
  // position leaves sub-cent dust here (float / HF buffer), which must not
  // enable the Borrow CTA. While capacity is loading/errored this is 0 → false,
  // the safe default.
  const canBorrow = availableToBorrowUsd >= MIN_BORROWABLE_USD;

  const { findProvider } = useVaultProviders();
  const { reorderedOrder, clearReorderedOrder } = useReorderOverride();
  const { activatingVaults, clearActivatingVault } = useActivatingVaults();

  const { pendingVaults } = usePendingVaults();
  const pendingWithdrawVaultIds = useMemo(() => {
    const ids = new Set<string>();
    for (const [vaultId, operation] of pendingVaults) {
      if (operation === "withdraw") ids.add(vaultId.toLowerCase());
    }
    return ids;
  }, [pendingVaults]);

  // Indexer entries (liquidationIndex straight from the indexer), re-tagged
  // with the withdrawals whose transaction is mined but not yet indexed. These
  // drive reconciliation — they reflect what the indexer currently believes,
  // independent of any active override.
  const rawCollateralVaults = useMemo(
    (): CollateralVaultEntry[] =>
      applyPendingWithdrawals(
        position?.collaterals
          ? toCollateralVaultEntries(position.collaterals, findProvider)
          : [],
        pendingWithdrawVaultIds,
      ),
    [position?.collaterals, findProvider, pendingWithdrawVaultIds],
  );

  const activeCollateralVaults = useMemo(
    () => rawCollateralVaults.filter((entry) => entry.lifecycle === "active"),
    [rawCollateralVaults],
  );

  const withdrawingCollateralVaults = useMemo(
    () =>
      rawCollateralVaults.filter((entry) => entry.lifecycle === "withdrawing"),
    [rawCollateralVaults],
  );

  // Optimistic "Activating…" rows: just-activated vaults the indexer hasn't
  // ingested yet. Excludes any vault already present in the indexer entries so
  // we never duplicate a row once it lands, and any entry that belongs to a
  // different depositor address so switching wallets during the optimistic
  // window can't leak one account's activating vault onto another's dashboard.
  const activatingEntries = useMemo((): CollateralVaultEntry[] => {
    if (activatingVaults.size === 0) return [];
    const connected = connectedAddress?.toLowerCase();
    const indexedIds = new Set(
      rawCollateralVaults.map((v) => v.vaultId.toLowerCase()),
    );
    if (!connected) return [];
    return Array.from(activatingVaults.values())
      .filter((entry) => !indexedIds.has(entry.vaultId.toLowerCase()))
      .filter((entry) => entry.depositorEthAddress?.toLowerCase() === connected)
      .map((entry): CollateralVaultEntry => {
        const provider = findProvider?.(entry.providerAddress ?? "");
        return {
          id: `activating-${entry.vaultId}`,
          lifecycle: "activating",
          vaultId: entry.vaultId,
          amountBtc: entry.amountBtc,
          addedAt: 0,
          inUse: false,
          providerAddress: entry.providerAddress ?? "",
          providerName:
            provider?.name ?? truncateHash(entry.providerAddress ?? ""),
          providerIconUrl: provider?.iconUrl,
          // No indexed liquidation order yet; sentinel keeps it last if sorted.
          liquidationIndex: Number.MAX_SAFE_INTEGER,
        };
      });
  }, [activatingVaults, rawCollateralVaults, findProvider, connectedAddress]);

  // Displayed entries. Normally indexer-ordered; right after a reorder,
  // `reorderedOrder` holds the submitted order so the new order (and each row's
  // ordinal) shows immediately. Falls back to indexer ordering once the
  // override no longer matches the vault set, which covers the active rows
  // alone. Withdrawing rows, then optimistic activating rows, are appended
  // after, until the indexer reflects them.
  const collateralVaults = useMemo(
    (): CollateralVaultEntry[] => [
      ...sortByReorderedOverride(activeCollateralVaults, reorderedOrder),
      ...withdrawingCollateralVaults,
      ...activatingEntries,
    ],
    [
      activeCollateralVaults,
      withdrawingCollateralVaults,
      reorderedOrder,
      activatingEntries,
    ],
  );

  // Drop the override once the indexer reflects the reordered sequence (or the
  // vault set changed), handing display back to the indexer ordering. Compares
  // against the raw indexer entries, not the override-rewritten ones.
  useEffect(() => {
    if (!reorderedOrder) return;
    if (isReorderOverrideReconciled(activeCollateralVaults, reorderedOrder)) {
      clearReorderedOrder();
    }
  }, [activeCollateralVaults, reorderedOrder, clearReorderedOrder]);

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

  // Net the optimistic deltas against the chain snapshot: add the activations it
  // does not include yet, subtract the withdrawals it still counts. Both filters
  // key on `vaultIds`, which comes from the same chain read as `collateralBtc`,
  // so neither delta can be applied twice.
  const displayCollateralBtc = useMemo(() => {
    const chainVaultIds = new Set(
      position?.vaultIds.map((id) => id.toLowerCase()) ?? [],
    );
    const activatingBtc = activatingEntries
      .filter((entry) => !chainVaultIds.has(entry.vaultId.toLowerCase()))
      .reduce((sum, entry) => sum + entry.amountBtc, 0);
    const withdrawingBtc = withdrawingCollateralVaults
      .filter((entry) => chainVaultIds.has(entry.vaultId.toLowerCase()))
      .reduce((sum, entry) => sum + entry.amountBtc, 0);
    return collateralBtc + activatingBtc - withdrawingBtc;
  }, [
    collateralBtc,
    activatingEntries,
    withdrawingCollateralVaults,
    position?.vaultIds,
  ]);

  // Optimistic rows must not enable actions before collateral exists on-chain.
  const hasCollateral = collateralBtc > 0;
  // Display gate — drives the Collateral section's summary-vs-empty rendering,
  // so the just-activated vault shows during the indexer gap and a withdrawing
  // vault, whose `collateralBtc` the indexer has already zeroed, still shows
  // until its payout settles.
  const hasDisplayCollateral =
    collateralBtc > 0 ||
    activatingEntries.length > 0 ||
    withdrawingCollateralVaults.length > 0;

  return {
    position,
    indexerError: position?.indexerError ?? null,
    collateralBtc,
    displayCollateralBtc,
    collateralValueUsd,
    debtValueUsd,
    availableToBorrowUsd,
    canBorrow,
    collateralFactorBps: splitParams ? liquidationThresholdBps : null,
    isBorrowCapacityLoading,
    borrowCapacityError,
    healthFactor,
    healthFactorStatus,
    borrowedAssets,
    hasLoans,
    hasCollateral,
    hasDisplayCollateral,
    collateralVaults,
    isLoading,
    positionError,
    refetchPosition,
  };
}
