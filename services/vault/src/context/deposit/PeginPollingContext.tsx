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
  useEffect,
  useMemo,
  useState,
} from "react";

import { usePeginPollingQuery } from "../../hooks/deposit/usePeginPollingQuery";
import { usePrePeginMempoolConfirmations } from "../../hooks/deposit/usePrePeginMempoolConfirmations";
import {
  ContractStatus,
  getPeginState,
  LocalStorageStatus,
} from "../../models/peginStateMachine";
import {
  addConfirmedPrePeginTxid,
  loadConfirmedPrePeginTxids,
} from "../../storage/confirmedPrePeginCache";
import type { VaultActivity } from "../../types/activity";
import type {
  DepositPollingResult,
  PeginPollingContextValue,
  PeginPollingProviderProps,
} from "../../types/peginPolling";
import { isTerminalPollingError } from "../../utils/peginPolling";
import { canonicalizeTxid } from "../../utils/txid";
import { isVaultOwnedByWallet } from "../../utils/vaultWarnings";
import { useProtocolParamsContext } from "../ProtocolParamsContext";

/**
 * Whether a vault's localStorage status puts it in the window where the
 * mempool can still tell us something new about Pre-PegIn depth.
 * PAYOUT_SIGNED+ means the VP has already verified BTC at depth.
 */
function isPrePeginPollEligibleStatus(
  status: LocalStorageStatus | undefined,
): boolean {
  return (
    status === undefined ||
    status === LocalStorageStatus.PENDING ||
    status === LocalStorageStatus.CONFIRMING
  );
}

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
    errors,
    needsWotsKey,
    pendingIngestion,
    pendingDepositorSignatures,
    isLoading,
    refetch,
  } = usePeginPollingQuery({
    activities,
    pendingPegins,
    btcPublicKey,
  });

  // Poll `prePeginTxHash` (depositor broadcast tx; `peginTxHash` is the VP
  // activation tx and doesn't exist during PENDING). Include vaults where
  // we haven't yet confirmed BTC-at-depth: no localStorage / PENDING /
  // CONFIRMING. Skip PAYOUT_SIGNED / CONFIRMED / REFUND_BROADCAST (VP has
  // already advanced past depth). Skip txids already in the persistent
  // confirmed cache — chain doesn't rewind, repolling reads the same fact.
  // State-machine consumer still sees the depth signal via the query's
  // `placeholderData` carryover, so dropping from the poll set is safe.
  const { config, getOffchainParamsByVersion } = useProtocolParamsContext();
  const [confirmedTxids, setConfirmedTxids] = useState<Set<string>>(
    loadConfirmedPrePeginTxids,
  );

  const getRequiredPrePeginDepth = useCallback(
    (activity: VaultActivity): number => {
      const versioned =
        activity.offchainParamsVersion !== undefined
          ? getOffchainParamsByVersion(activity.offchainParamsVersion)
          : undefined;
      return (
        versioned?.minPrepeginDepth ?? config.offchainParams.minPrepeginDepth
      );
    },
    [getOffchainParamsByVersion, config.offchainParams.minPrepeginDepth],
  );

  const localStatusById = useMemo(() => {
    const map = new Map<string, LocalStorageStatus>();
    for (const p of pendingPegins) {
      if (p.status) map.set(p.id, p.status as LocalStorageStatus);
    }
    return map;
  }, [pendingPegins]);

  const pendingPrePeginTxids = useMemo(
    () =>
      activities
        .filter((a) => {
          if ((a.contractStatus ?? 0) !== ContractStatus.PENDING) return false;
          if (!isPrePeginPollEligibleStatus(localStatusById.get(a.id)))
            return false;
          const txid = canonicalizeTxid(a.prePeginTxHash);
          return !(txid && confirmedTxids.has(txid));
        })
        .map((a) => a.prePeginTxHash),
    [activities, localStatusById, confirmedTxids],
  );
  const { confirmationsByTxid: prePeginConfirmationsByTxid } =
    usePrePeginMempoolConfirmations(pendingPrePeginTxids);

  // Persist newly-confirmed observations and drop them from the polled set
  // on next render. Functional setState keeps `confirmedTxids` out of the
  // dep array so the effect doesn't re-fire every time the cache grows.
  useEffect(() => {
    if (prePeginConfirmationsByTxid.size === 0) return;
    setConfirmedTxids((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const activity of activities) {
        const txid = canonicalizeTxid(activity.prePeginTxHash);
        if (!txid || next.has(txid)) continue;
        const observed = prePeginConfirmationsByTxid.get(txid);
        if (observed === undefined) continue;
        if (observed < getRequiredPrePeginDepth(activity)) continue;
        addConfirmedPrePeginTxid(txid);
        next.add(txid);
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [prePeginConfirmationsByTxid, activities, getRequiredPrePeginDepth]);

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

      const depositError = errors?.get(depositId);
      const vpTerminalError =
        depositError && isTerminalPollingError(depositError)
          ? depositError.message
          : undefined;

      const justSignedPayoutsThisSession =
        optimisticStatuses.get(depositId) === LocalStorageStatus.PAYOUT_SIGNED;
      const transactionsReady = justSignedPayoutsThisSession
        ? false
        : (pendingDepositorSignatures?.has(depositId) ?? false);

      // Per-vault depth (pinned to the registration's offchainParamsVersion)
      // so a governance bump to `minPrepeginDepth` doesn't misclassify older
      // deposits.
      const requiredDepth = getRequiredPrePeginDepth(activity);

      // Same key as `pendingPrePeginTxids` — depositor's broadcast tx.
      const prePeginCanonical = canonicalizeTxid(activity.prePeginTxHash);
      const confirmations = prePeginCanonical
        ? prePeginConfirmationsByTxid.get(prePeginCanonical)
        : undefined;
      const prePeginBroadcastConfirmed =
        confirmations !== undefined && confirmations >= requiredDepth;

      const peginState = getPeginState(contractStatus, {
        localStatus,
        transactionsReady,
        isInUse: activity.isInUse,
        needsWotsKey: needsWotsKey?.has(depositId),
        pendingIngestion: pendingIngestion?.has(depositId),
        prePeginBroadcastConfirmed,
        expirationReason: activity.expirationReason,
        expiredAt: activity.expiredAt,
        canRefund: !!activity.unsignedPrePeginTx,
        vpTerminalError,
        refundBroadcastAt,
      });

      return {
        depositId,
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
      pendingDepositorSignatures,
      errors,
      needsWotsKey,
      pendingIngestion,
      prePeginConfirmationsByTxid,
      getRequiredPrePeginDepth,
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
