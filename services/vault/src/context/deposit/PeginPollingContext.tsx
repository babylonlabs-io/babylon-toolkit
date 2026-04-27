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
import {
  areTransactionsReady,
  isTerminalPollingError,
} from "../../utils/peginPolling";
import { isVaultOwnedByWallet } from "../../utils/vaultWarnings";

/**
 * Resolve the effective local status for a deposit, accounting for
 * optimistic UI updates.
 */
function resolveLocalStatus(
  depositId: string,
  optimisticStatuses: Map<string, LocalStorageStatus>,
  pendingPegins: Array<{ id: string; status?: string }>,
): LocalStorageStatus | undefined {
  const pendingPegin = pendingPegins.find((p) => p.id === depositId);
  const optimistic = optimisticStatuses.get(depositId);
  return (optimistic ?? pendingPegin?.status) as LocalStorageStatus | undefined;
}

/**
 * Resolve the broadcast timestamp anchoring the REFUND_BROADCAST suppression
 * TTL. Falls back to the optimistic timestamp set right after broadcast (when
 * localStorage has not yet been read back into `pendingPegins`).
 */
function resolveRefundBroadcastAt(
  depositId: string,
  optimisticRefundBroadcastAt: Map<string, number>,
  pendingPegins: Array<{ id: string; refundBroadcastAt?: number }>,
): number | undefined {
  return (
    optimisticRefundBroadcastAt.get(depositId) ??
    pendingPegins.find((p) => p.id === depositId)?.refundBroadcastAt
  );
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
}: PeginPollingProviderProps) {
  // Optimistic status overrides (for immediate UI feedback after signing)
  const [optimisticStatuses, setOptimisticStatuses] = useState<
    Map<string, LocalStorageStatus>
  >(new Map());
  // Companion timestamp for REFUND_BROADCAST so the suppression TTL is honored
  // immediately, before localStorage is read back.
  const [optimisticRefundBroadcastAt, setOptimisticRefundBroadcastAt] =
    useState<Map<string, number>>(new Map());

  // Use the polling query hook
  const {
    data,
    depositorGraphs,
    errors,
    needsWotsKey,
    pendingIngestion,
    isLoading,
    refetch,
  } = usePeginPollingQuery({
    activities,
    pendingPegins,
    btcPublicKey,
  });

  // Optimistic status handlers
  const setOptimisticStatus = useCallback(
    (
      depositId: string,
      newStatus: LocalStorageStatus,
      refundBroadcastAt?: number,
    ) => {
      setOptimisticStatuses((prev) => {
        const next = new Map(prev);
        next.set(depositId, newStatus);
        return next;
      });
      if (refundBroadcastAt !== undefined) {
        setOptimisticRefundBroadcastAt((prev) => {
          const next = new Map(prev);
          next.set(depositId, refundBroadcastAt);
          return next;
        });
      }
    },
    [],
  );

  const clearOptimisticStatus = useCallback((depositId: string) => {
    setOptimisticStatuses((prev) => {
      const next = new Map(prev);
      next.delete(depositId);
      return next;
    });
    setOptimisticRefundBroadcastAt((prev) => {
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
        optimisticStatuses,
        pendingPegins,
      );
      const refundBroadcastAt = resolveRefundBroadcastAt(
        depositId,
        optimisticRefundBroadcastAt,
        pendingPegins,
      );

      const transactions = data?.get(depositId) ?? null;
      const isReady = transactions ? areTransactionsReady(transactions) : false;

      const depositError = errors?.get(depositId);
      const vpTerminalError =
        depositError && isTerminalPollingError(depositError)
          ? depositError.message
          : undefined;

      const peginState = getPeginState(contractStatus, {
        localStatus,
        transactionsReady: isReady,
        isInUse: activity.isInUse,
        needsWotsKey: needsWotsKey?.has(depositId),
        pendingIngestion: pendingIngestion?.has(depositId),
        expirationReason: activity.expirationReason,
        expiredAt: activity.expiredAt,
        canRefund: !!activity.unsignedPrePeginTx,
        vpTerminalError,
        refundBroadcastAt,
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
      };
    },
    [
      activities,
      pendingPegins,
      data,
      depositorGraphs,
      errors,
      needsWotsKey,
      pendingIngestion,
      isLoading,
      optimisticStatuses,
      optimisticRefundBroadcastAt,
      btcPublicKey,
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
