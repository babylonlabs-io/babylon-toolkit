/**
 * Pending Vaults Context
 *
 * Tracks vault IDs that have been submitted for collateral but may not yet
 * be reflected in the indexer. This prevents users from re-selecting the
 * same vaults during the indexer delay.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface PendingVaultsContextValue {
  /** Set of vault IDs currently pending (submitted but not yet indexed) */
  pendingVaultIds: Set<string>;
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
  children: ReactNode;
}

/**
 * Provider that tracks pending vault IDs.
 * Wrap this around the Aave routes.
 */
export function PendingVaultsProvider({
  children,
}: PendingVaultsProviderProps) {
  const [pendingVaultIds, setPendingVaultIds] = useState<Set<string>>(
    new Set(),
  );

  const markVaultsAsPending = useCallback((vaultIds: string[]) => {
    setPendingVaultIds((prev) => {
      const next = new Set(prev);
      vaultIds.forEach((id) => next.add(id));
      return next;
    });
  }, []);

  const clearPendingVaults = useCallback((vaultIds: string[]) => {
    setPendingVaultIds((prev) => {
      const next = new Set(prev);
      vaultIds.forEach((id) => next.delete(id));
      return next;
    });
  }, []);

  const clearAllPendingVaults = useCallback(() => {
    setPendingVaultIds(new Set());
  }, []);

  const value = useMemo(
    () => ({
      pendingVaultIds,
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
