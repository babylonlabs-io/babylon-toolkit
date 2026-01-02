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
  useState,
  type ReactNode,
} from "react";

import { PENDING_COLLATERAL_UPDATE_EVENT } from "@/constants";
import { useETHWallet } from "@/context/wallet";
import { PEGIN_DISPLAY_LABELS } from "@/models/peginStateMachine";
import {
  addPendingCollateralVaultIds,
  clearPendingCollateralVaultIds,
  getPendingCollateralVaultIds,
  removePendingCollateralVaultIds,
} from "@/storage/pendingCollateralStorage";

import type { VaultData } from "../components/Overview/components/VaultsTable";

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
  const [storageVersion, setStorageVersion] = useState(0);

  // Load pending vault IDs from localStorage whenever address changes or storage is updated
  useEffect(() => {
    if (!address) {
      setPendingVaultIds(new Set());
      return;
    }
    const ids = getPendingCollateralVaultIds(appId, address);
    setPendingVaultIds(new Set(ids));
  }, [appId, address, storageVersion]);

  // Listen for custom events when localStorage is updated (same-tab updates)
  useEffect(() => {
    if (!address) return;

    const handleCustomEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{
        appId: string;
        ethAddress: string;
      }>;
      if (
        customEvent.detail.appId === appId &&
        customEvent.detail.ethAddress.toLowerCase() === address.toLowerCase()
      ) {
        // Trigger refresh by incrementing version
        setStorageVersion((v) => v + 1);
      }
    };

    window.addEventListener(PENDING_COLLATERAL_UPDATE_EVENT, handleCustomEvent);

    return () => {
      window.removeEventListener(
        PENDING_COLLATERAL_UPDATE_EVENT,
        handleCustomEvent,
      );
    };
  }, [appId, address]);

  // Mark vault IDs as pending - storage function will dispatch event
  const markVaultsAsPending = useCallback(
    (vaultIds: string[]) => {
      if (!address) return;
      addPendingCollateralVaultIds(appId, address, vaultIds);
      // Event will be dispatched by storage function - no manual state update needed
    },
    [appId, address],
  );

  // Clear pending vault IDs - storage function will dispatch event
  const clearPendingVaults = useCallback(
    (vaultIds: string[]) => {
      if (!address) return;
      removePendingCollateralVaultIds(appId, address, vaultIds);
      // Event will be dispatched by storage function - no manual state update needed
    },
    [appId, address],
  );

  // Clear all pending vault IDs - storage function will dispatch event
  const clearAllPendingVaults = useCallback(() => {
    if (!address) return;
    clearPendingCollateralVaultIds(appId, address);
    // Event will be dispatched by storage function - no manual state update needed
  }, [appId, address]);

  const hasPendingDeposit = pendingVaultIds.size > 0;

  const value = useMemo(
    () => ({
      pendingVaultIds,
      hasPendingDeposit,
      markVaultsAsPending,
      clearPendingVaults,
      clearAllPendingVaults,
    }),
    [
      pendingVaultIds,
      hasPendingDeposit,
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

  useEffect(() => {
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
