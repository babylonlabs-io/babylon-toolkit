/**
 * Pending Vaults Context
 *
 * Tracks vault IDs that have been submitted for collateral operations
 * (add or withdraw) but may not yet be reflected in the indexer.
 */

import { useQueryClient } from "@tanstack/react-query";
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
  getPendingCollateralVaults,
  removePendingCollateralVaultIds,
  type PendingOperation,
  type PendingVaultInfo,
} from "@/storage/pendingCollateralStorage";

import type { VaultData } from "../types";

interface PendingVaultsContextValue {
  /** Map of vault IDs to their pending operation type */
  pendingVaults: Map<string, PendingOperation>;
  /** Whether there are any pending operations awaiting confirmation */
  hasPendingOperation: boolean;
  /** Whether there are pending add operations */
  hasPendingAdd: boolean;
  /** Whether there are pending withdraw operations */
  hasPendingWithdraw: boolean;
  /** Mark vault IDs as pending after successful transaction */
  markVaultsAsPending: (
    vaultIds: string[],
    operation: PendingOperation,
  ) => void;
  /** Clear pending status for vault IDs (called when indexer confirms) */
  clearPendingVaults: (vaultIds: string[]) => void;
  /** Clear all pending vaults */
  clearAllPendingVaults: () => void;
}

const PendingVaultsContext = createContext<PendingVaultsContextValue | null>(
  null,
);

interface PendingVaultsProviderProps {
  /** Application identifier for storage namespacing (e.g., "aave") */
  appId: string;
  children: ReactNode;
}

/**
 * Convert pending vault info array to Map
 */
function toMap(entries: PendingVaultInfo[]): Map<string, PendingOperation> {
  return new Map(entries.map((e) => [e.id, e.operation]));
}

/**
 * Provider that tracks pending vault IDs using localStorage for persistence.
 */
export function PendingVaultsProvider({
  appId,
  children,
}: PendingVaultsProviderProps) {
  const { address } = useETHWallet();
  const [pendingVaults, setPendingVaults] = useState<
    Map<string, PendingOperation>
  >(new Map());

  // Load pending vaults from localStorage on mount and when address changes
  useEffect(() => {
    if (!address) {
      setPendingVaults(new Map());
      return;
    }
    const entries = getPendingCollateralVaults(appId, address);
    setPendingVaults(toMap(entries));
  }, [appId, address]);

  // Mark vault IDs as pending
  const markVaultsAsPending = useCallback(
    (vaultIds: string[], operation: PendingOperation) => {
      if (!address || vaultIds.length === 0) return;
      addPendingCollateralVaultIds(appId, address, vaultIds, operation);
      setPendingVaults((prev) => {
        const next = new Map(prev);
        vaultIds.forEach((id) => next.set(id, operation));
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
      setPendingVaults((prev) => {
        const next = new Map(prev);
        vaultIds.forEach((id) => next.delete(id));
        return next;
      });
    },
    [appId, address],
  );

  // Clear all pending vaults
  const clearAllPendingVaults = useCallback(() => {
    if (!address) return;
    clearPendingCollateralVaultIds(appId, address);
    setPendingVaults(new Map());
  }, [appId, address]);

  const value = useMemo(() => {
    const operations = Array.from(pendingVaults.values());
    return {
      pendingVaults,
      hasPendingOperation: pendingVaults.size > 0,
      hasPendingAdd: operations.includes("add"),
      hasPendingWithdraw: operations.includes("withdraw"),
      markVaultsAsPending,
      clearPendingVaults,
      clearAllPendingVaults,
    };
  }, [
    pendingVaults,
    markVaultsAsPending,
    clearPendingVaults,
    clearAllPendingVaults,
  ]);

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
 * Check if a vault's status matches the expected status for its pending operation
 */
function isOperationConfirmed(
  vault: VaultData,
  operation: PendingOperation,
): boolean {
  if (operation === "add") {
    // Add is confirmed when vault becomes "In Use"
    return vault.status === PEGIN_DISPLAY_LABELS.IN_USE;
  } else {
    // Withdraw is confirmed when vault becomes "Available"
    return vault.status === PEGIN_DISPLAY_LABELS.AVAILABLE;
  }
}

/**
 * Hook to sync pending vaults with indexed vault data.
 * Automatically clears pending vault IDs when the indexer confirms the operation.
 * - Add: cleared when vault status becomes "In Use"
 * - Withdraw: cleared when vault status becomes "Available"
 *
 * Also triggers a refetch of the Aave position when operations are confirmed,
 * since the position data comes from expensive RPC calls and shouldn't be polled frequently.
 */
export function useSyncPendingVaults(vaults: VaultData[]): void {
  const { pendingVaults, clearPendingVaults } = usePendingVaults();
  const { address } = useETHWallet();
  const queryClient = useQueryClient();
  const prevVaultsRef = useRef(vaults);

  useEffect(() => {
    // Only run when vaults array reference changes (new data from indexer)
    if (prevVaultsRef.current === vaults) return;
    prevVaultsRef.current = vaults;

    if (pendingVaults.size === 0 || vaults.length === 0) return;

    const confirmedVaultIds = vaults
      .filter((vault) => {
        const operation = pendingVaults.get(vault.id);
        if (!operation) return false;
        return isOperationConfirmed(vault, operation);
      })
      .map((vault) => vault.id);

    if (confirmedVaultIds.length > 0) {
      // Refetch Aave position first, then clear pending state.
      // This ensures we show the loading UI until fresh RPC data is available,
      // preventing the brief flash of stale cached data.
      const syncPosition = async () => {
        if (address) {
          await queryClient.refetchQueries({
            queryKey: ["aaveUserPosition", address],
          });
        }
        // Only clear pending after RPC completes
        clearPendingVaults(confirmedVaultIds);
      };

      void syncPosition();
    }
  }, [vaults, pendingVaults, clearPendingVaults, address, queryClient]);
}
