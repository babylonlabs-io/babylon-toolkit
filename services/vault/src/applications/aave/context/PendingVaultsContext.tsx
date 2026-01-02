/**
 * Pending Vaults Context
 *
 * Tracks vault IDs that have been submitted for collateral but may not yet
 * be reflected in the indexer.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useETHWallet } from "@/context/wallet";
import { PEGIN_DISPLAY_LABELS } from "@/models/peginStateMachine";
import {
  addPendingCollateralVaultIds,
  clearPendingCollateralVaultIds,
  getPendingCollateralVaultIds,
  removePendingCollateralVaultIds,
} from "@/storage/pendingCollateralStorage";

import type { VaultData } from "../types";

interface PendingVaultsContextValue {
  /** Set of vault IDs currently pending (submitted but not yet indexed) */
  pendingVaultIds: Set<string>;
  /** Whether there are any pending deposits awaiting confirmation */
  hasPendingDeposit: boolean;
  /** Mark vault IDs as pending after successful transaction */
  markVaultsAsPending: (vaultIds: string[]) => void;
  /** Clear pending status for vault IDs (called when indexer confirms) */
  clearPendingVaults: (vaultIds: string[]) => void;
  /** Clear all pending vaults */
  clearAllPendingVaults: () => void;
}

const PendingVaultsContext = createContext<PendingVaultsContextValue | null>(
  null,
);

interface PendingVaultsProviderProps {
  /** Application identifier for storage namespacing (e.g., "aave", "morpho") */
  appId: string;
  children: ReactNode;
}

/**
 * Provider that tracks pending vault IDs using localStorage for persistence.
 */
export function PendingVaultsProvider({
  appId,
  children,
}: PendingVaultsProviderProps) {
  const { address } = useETHWallet();
  const [pendingVaultIds, setPendingVaultIds] = useState<Set<string>>(
    new Set(),
  );

  // Load pending vault IDs from localStorage on mount and when address changes
  useEffect(() => {
    if (!address) {
      setPendingVaultIds(new Set());
      return;
    }
    const ids = getPendingCollateralVaultIds(appId, address);
    setPendingVaultIds(new Set(ids));
  }, [appId, address]);

  // Mark vault IDs as pending
  const markVaultsAsPending = useCallback(
    (vaultIds: string[]) => {
      if (!address || vaultIds.length === 0) return;
      addPendingCollateralVaultIds(appId, address, vaultIds);
      setPendingVaultIds((prev) => {
        const next = new Set(prev);
        vaultIds.forEach((id) => next.add(id));
        return next;
      });
    },
    [appId, address],
  );

  // Clear pending vault IDs
  const clearPendingVaults = useCallback(
    (vaultIds: string[]) => {
      if (!address || vaultIds.length === 0) return;
      removePendingCollateralVaultIds(appId, address, vaultIds);
      setPendingVaultIds((prev) => {
        const next = new Set(prev);
        vaultIds.forEach((id) => next.delete(id));
        return next;
      });
    },
    [appId, address],
  );

  // Clear all pending vault IDs
  const clearAllPendingVaults = useCallback(() => {
    if (!address) return;
    clearPendingCollateralVaultIds(appId, address);
    setPendingVaultIds(new Set());
  }, [appId, address]);

  const value = useMemo(
    () => ({
      pendingVaultIds,
      hasPendingDeposit: pendingVaultIds.size > 0,
      markVaultsAsPending,
      clearPendingVaults,
      clearAllPendingVaults,
    }),
    [
      pendingVaultIds,
      markVaultsAsPending,
      clearPendingVaults,
      clearAllPendingVaults,
    ],
  );

  return (
    <PendingVaultsContext.Provider value={value}>
      {children}
    </PendingVaultsContext.Provider>
  );
}

/**
 * Hook to access pending vaults context.
 * Must be used within a PendingVaultsProvider.
 */
export function usePendingVaults(): PendingVaultsContextValue {
  const ctx = useContext(PendingVaultsContext);
  if (!ctx) {
    throw new Error(
      "usePendingVaults must be used within a PendingVaultsProvider",
    );
  }
  return ctx;
}

/**
 * Hook to sync pending vaults with indexed vault data.
 * Automatically clears pending vault IDs when the indexer confirms them as "In Use".
 */
export function useSyncPendingVaults(vaults: VaultData[]): void {
  const { pendingVaultIds, clearPendingVaults } = usePendingVaults();
  const prevVaultsRef = useRef(vaults);

  useEffect(() => {
    // Only run when vaults array reference changes (new data from indexer)
    if (prevVaultsRef.current === vaults) return;
    prevVaultsRef.current = vaults;

    if (pendingVaultIds.size === 0 || vaults.length === 0) return;

    const confirmedVaultIds = vaults
      .filter(
        (vault) =>
          pendingVaultIds.has(vault.id) &&
          vault.status === PEGIN_DISPLAY_LABELS.IN_USE,
      )
      .map((vault) => vault.id);

    if (confirmedVaultIds.length > 0) {
      clearPendingVaults(confirmedVaultIds);
    }
  }, [vaults, pendingVaultIds, clearPendingVaults]);
}
