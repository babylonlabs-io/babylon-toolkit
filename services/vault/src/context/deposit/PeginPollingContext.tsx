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
import { stripHexPrefix } from "../../utils/btc";
import { areTransactionsReady } from "../../utils/peginPolling";
import { isVaultOwnedByWallet } from "../../utils/vaultWarnings";

/**
 * Resolve the effective local status for a deposit, accounting for
 * optimistic UI updates and auto-detection of broadcast state.
 */
function resolveLocalStatus(
  depositId: string,
  contractStatus: ContractStatus,
  optimisticStatuses: Map<string, LocalStorageStatus>,
  pendingPegins: Array<{ id: string; status?: string }>,
  hasUtxoData: boolean,
  broadcastedTxIds: Set<string>,
): LocalStorageStatus | undefined {
  const pendingPegin = pendingPegins.find((p) => p.id === depositId);
  const optimistic = optimisticStatuses.get(depositId);
  let localStatus = (optimistic ?? pendingPegin?.status) as
    | LocalStorageStatus
    | undefined;

  // Auto-detect CONFIRMING state from blockchain data.
  // If contract is VERIFIED and the tx is already broadcast to Bitcoin,
  // treat as CONFIRMING even if localStorage doesn't have this status.
  if (
    hasUtxoData &&
    contractStatus === ContractStatus.VERIFIED &&
    localStatus !== LocalStorageStatus.CONFIRMING
  ) {
    const txid = stripHexPrefix(depositId).toLowerCase();
    if (broadcastedTxIds.has(txid)) {
      localStatus = LocalStorageStatus.CONFIRMING;
    }
  }

  return localStatus;
}

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
}: PeginPollingProviderProps) {
  // Optimistic status overrides (for immediate UI feedback after signing)
  const [optimisticStatuses, setOptimisticStatuses] = useState<
    Map<string, LocalStorageStatus>
  >(new Map());

  // Use the polling query hook
  const {
    data,
    depositorGraphs,
    errors,
    needsLamportKey,
    pendingIngestion,
    isLoading,
    refetch,
  } = usePeginPollingQuery({
    activities,
    pendingPegins,
    btcPublicKey,
  });

  // Fetch UTXOs and recent transactions using React Query (cached with 30s staleTime)
  const {
    allUTXOs,
    broadcastedTxIds,
    isLoading: isLoadingUtxos,
    error: utxoError,
  } = useUTXOs(btcAddress);

  // Validate UTXOs for pending broadcast deposits
  // Pass undefined while loading or on error to avoid false positives
  // (error state would have empty arrays, falsely marking deposits as invalid)
  // broadcastedTxIds is used to detect if UTXOs were spent by vault's own tx (confirming vs invalid)
  const hasUtxoData = !!btcAddress && !isLoadingUtxos && !utxoError;
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

      const contractStatus = (activity.contractStatus ?? 0) as ContractStatus;
      const localStatus = resolveLocalStatus(
        depositId,
        contractStatus,
        optimisticStatuses,
        pendingPegins,
        hasUtxoData,
        broadcastedTxIds,
      );

      const transactions = data?.get(depositId) ?? null;
      const isReady = transactions ? areTransactionsReady(transactions) : false;
      const utxoUnavailable = unavailableUtxos.has(depositId);

      const peginState = getPeginState(contractStatus, {
        localStatus,
        transactionsReady: isReady,
        isInUse: activity.isInUse,
        utxoUnavailable,
        needsLamportKey: needsLamportKey?.has(depositId),
        pendingIngestion: pendingIngestion?.has(depositId),
        expirationReason: activity.expirationReason,
        expiredAt: activity.expiredAt,
      });

      return {
        depositId,
        transactions,
        depositorGraph: depositorGraphs?.get(depositId) ?? null,
        isReady,
        loading: isLoading,
        error: errors?.get(depositId) ?? null,
        peginState,
        isOwnedByCurrentWallet: isVaultOwnedByWallet(
          activity.depositorBtcPubkey,
          btcPublicKey,
        ),
        utxoUnavailable,
      };
    },
    [
      activities,
      pendingPegins,
      data,
      depositorGraphs,
      errors,
      needsLamportKey,
      pendingIngestion,
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
