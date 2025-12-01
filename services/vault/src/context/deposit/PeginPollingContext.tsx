/**
 * Centralized Peg-In Polling Context
 *
 * Manages polling for payout transactions across ALL pending deposits
 * from a single location, eliminating per-row hook instantiation.
 *
 * Key benefits:
 * - Single polling interval for all deposits (vs N intervals for N deposits)
 * - Batched RPC calls by vault provider
 * - Shared state across all table rows and cells
 * - Optimistic UI updates for immediate feedback
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import { usePeginPollingQuery } from "../../hooks/deposit/usePeginPollingQuery";
import {
  ContractStatus,
  getPeginState,
  LocalStorageStatus,
} from "../../models/peginStateMachine";
import type {
  DepositPollingResult,
  PeginPollingContextValue,
  PeginPollingProviderProps,
} from "../../types/peginPolling";
import { areTransactionsReady } from "../../utils/peginPolling";

const PeginPollingContext = createContext<PeginPollingContextValue | null>(
  null,
);

/**
 * Centralized Peg-In Polling Provider
 *
 * Manages a single polling loop for all pending deposits instead of
 * creating N polling hooks for N deposits.
 */
export function PeginPollingProvider({
  children,
  activities,
  pendingPegins,
  btcPublicKey,
  vaultProviders,
}: PeginPollingProviderProps) {
  // Optimistic status overrides (for immediate UI feedback after signing)
  const [optimisticStatuses, setOptimisticStatuses] = useState<
    Map<string, LocalStorageStatus>
  >(new Map());

  // Use the polling query hook
  const { data, isLoading, refetch } = usePeginPollingQuery({
    activities,
    pendingPegins,
    btcPublicKey,
    vaultProviders,
  });

  // Optimistic status handlers
  const setOptimisticStatus = useCallback(
    (depositId: string, newStatus: LocalStorageStatus) => {
      setOptimisticStatuses((prev) => {
        const next = new Map(prev);
        next.set(depositId, newStatus);
        return next;
      });
    },
    [],
  );

  const clearOptimisticStatus = useCallback((depositId: string) => {
    setOptimisticStatuses((prev) => {
      const next = new Map(prev);
      next.delete(depositId);
      return next;
    });
  }, []);

  // Build lookup function for individual deposit results
  const getPollingResult = useCallback(
    (depositId: string): DepositPollingResult | undefined => {
      const activity = activities.find((a) => a.id === depositId);
      if (!activity) return undefined;

      const pendingPegin = pendingPegins.find((p) => p.id === depositId);
      const contractStatus = (activity.contractStatus ?? 0) as ContractStatus;

      // Use optimistic status if available, otherwise use localStorage status
      const optimisticStatus = optimisticStatuses.get(depositId);
      const localStatus = (optimisticStatus ?? pendingPegin?.status) as
        | LocalStorageStatus
        | undefined;

      const transactions = data?.get(depositId) ?? null;
      const isReady = transactions ? areTransactionsReady(transactions) : false;

      const peginState = getPeginState(contractStatus, {
        localStatus,
        transactionsReady: isReady,
        isInUse: activity.isInUse,
      });

      return {
        depositId,
        transactions,
        isReady,
        loading: isLoading,
        error: null,
        peginState,
      };
    },
    [activities, pendingPegins, data, isLoading, optimisticStatuses],
  );

  const contextValue = useMemo(
    () => ({
      getPollingResult,
      isLoading,
      refetch: () => refetch(),
      setOptimisticStatus,
      clearOptimisticStatus,
    }),
    [
      getPollingResult,
      isLoading,
      refetch,
      setOptimisticStatus,
      clearOptimisticStatus,
    ],
  );

  return (
    <PeginPollingContext.Provider value={contextValue}>
      {children}
    </PeginPollingContext.Provider>
  );
}

/**
 * Hook to access the centralized polling context
 *
 * Must be used within a PeginPollingProvider
 */
export function usePeginPolling() {
  const context = useContext(PeginPollingContext);
  if (!context) {
    throw new Error(
      "usePeginPolling must be used within a PeginPollingProvider",
    );
  }
  return context;
}

/**
 * Hook to get polling result for a specific deposit
 *
 * Convenience hook that wraps getPollingResult.
 */
export function useDepositPollingResult(depositId: string) {
  const { getPollingResult } = usePeginPolling();
  return getPollingResult(depositId);
}

// Re-export types for external use
export type { DepositPollingResult } from "../../types/peginPolling";
