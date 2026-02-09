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
import { useUtxoValidation } from "../../hooks/deposit/useUtxoValidation";
import { useUTXOs } from "../../hooks/useUTXOs";
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
import { isVaultOwnedByWallet } from "../../utils/vaultWarnings";

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
  btcAddress,
  vaultProviders,
}: PeginPollingProviderProps) {
  // Optimistic status overrides (for immediate UI feedback after signing)
  const [optimisticStatuses, setOptimisticStatuses] = useState<
    Map<string, LocalStorageStatus>
  >(new Map());

  // Use the polling query hook
  const { data, errors, isLoading, refetch } = usePeginPollingQuery({
    activities,
    pendingPegins,
    btcPublicKey,
    vaultProviders,
  });

  // Fetch UTXOs and recent transactions using React Query (cached with 30s staleTime)
  const {
    allUTXOs,
    broadcastedTxIds,
    isLoading: isLoadingUtxos,
  } = useUTXOs(btcAddress);

  // Validate UTXOs for pending broadcast deposits
  // Pass undefined while loading to avoid false positives
  // broadcastedTxIds is used to detect if UTXOs were spent by vault's own tx (confirming vs invalid)
  const hasUtxoData = !!btcAddress && !isLoadingUtxos;
  const { unavailableUtxos } = useUtxoValidation({
    activities,
    btcPublicKey,
    availableUtxos: hasUtxoData ? allUTXOs : undefined,
    broadcastedTxIds: hasUtxoData ? broadcastedTxIds : undefined,
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
      let localStatus = (optimisticStatus ?? pendingPegin?.status) as
        | LocalStorageStatus
        | undefined;

      // Auto-detect CONFIRMING state from blockchain data
      // If contract is VERIFIED and the tx is already broadcast to Bitcoin,
      // treat as CONFIRMING even if localStorage doesn't have this status.
      // This handles cases where localStorage was lost or tx was broadcast externally.
      if (
        hasUtxoData &&
        contractStatus === ContractStatus.VERIFIED &&
        localStatus !== LocalStorageStatus.CONFIRMING
      ) {
        const txid = depositId.startsWith("0x")
          ? depositId.slice(2)
          : depositId;
        if (broadcastedTxIds.has(txid)) {
          localStatus = LocalStorageStatus.CONFIRMING;
        }
      }

      const transactions = data?.get(depositId) ?? null;
      const isReady = transactions ? areTransactionsReady(transactions) : false;

      // Get provider error for this deposit (if any)
      const providerError = errors?.get(depositId) ?? null;

      // Check if UTXO is unavailable for this deposit
      const utxoUnavailable = unavailableUtxos.has(depositId);

      const peginState = getPeginState(contractStatus, {
        localStatus,
        transactionsReady: isReady,
        isInUse: activity.isInUse,
        utxoUnavailable,
      });

      const isOwnedByCurrentWallet = isVaultOwnedByWallet(
        activity.depositorBtcPubkey,
        btcPublicKey,
      );

      return {
        depositId,
        transactions,
        isReady,
        loading: isLoading,
        error: providerError,
        peginState,
        isOwnedByCurrentWallet,
        utxoUnavailable,
      };
    },
    [
      activities,
      pendingPegins,
      data,
      errors,
      isLoading,
      optimisticStatuses,
      btcPublicKey,
      unavailableUtxos,
      hasUtxoData,
      broadcastedTxIds,
    ],
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
