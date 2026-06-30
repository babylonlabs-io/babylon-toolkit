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

import { useDemoDeposit } from "../../components/dev/demoDeposit";
import { usePeginPollingQuery } from "../../hooks/deposit/usePeginPollingQuery";
import { useBtcHtlcRefundStatus } from "../../hooks/useBtcHtlcRefundStatus";
import { useBtcMempoolConfirmations } from "../../hooks/useBtcMempoolConfirmations";
import {
  ContractStatus,
  LocalStorageStatus,
} from "../../models/peginStateMachine";
import {
  addConfirmedPrePeginTxid,
  loadConfirmedPrePeginTxids,
} from "../../storage/confirmedPrePeginCache";
import {
  addMatureRefundTxid,
  loadMatureRefundTxids,
} from "../../storage/matureRefundCache";
import {
  addRefundedHtlcVaultId,
  loadRefundedHtlcVaultIds,
} from "../../storage/refundedHtlcCache";
import type { VaultActivity } from "../../types/activity";
import type {
  DepositPollingResult,
  PeginPollingContextValue,
  PeginPollingProviderProps,
} from "../../types/peginPolling";
import { canonicalizeTxid } from "../../utils/txid";
import { isVaultOwnedByWallet } from "../../utils/vaultWarnings";
import { useProtocolParamsContext } from "../ProtocolParamsContext";

import { computeDepositPollingResult } from "./computeDepositPollingResult";

/** React Query namespace for the Pre-PegIn confirmation poller. */
const PREPEGIN_CONFIRMATIONS_QUERY_KEY = "prePeginMempoolConfirmations";

/** React Query namespace for the EXPIRED-vault HTLC refund-spend poller. */
const HTLC_REFUND_QUERY_KEY = "htlcRefundOutspend";

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
 * Pure scan: which Pre-PegIn txids crossed a per-vault threshold and
 * aren't cached yet? Shared by the at-depth and past-`tRefund` caches.
 */
function getTxidsCrossingThreshold(
  activities: VaultActivity[],
  confirmations: Map<string, number>,
  cached: Set<string>,
  filter: (a: VaultActivity) => boolean,
  threshold: (a: VaultActivity) => number | undefined,
): string[] {
  const out: string[] = [];
  for (const activity of activities) {
    if (!filter(activity)) continue;
    const txid = canonicalizeTxid(activity.prePeginTxHash);
    if (!txid || cached.has(txid)) continue;
    const observed = confirmations.get(txid);
    if (observed === undefined) continue;
    const t = threshold(activity);
    if (t === undefined || observed < t) continue;
    out.push(txid);
  }
  return out;
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
  // God-mode demo deposit (dev only; null unless NEXT_PUBLIC_FF_GOD_MODE_PANEL
  // is on and the panel toggle is enabled). When present, its ids resolve to
  // controlled results below instead of the live polling decision tree.
  const demo = useDemoDeposit();

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

  // Poll `prePeginTxHash` (depositor broadcast tx; `peginTxHash` is the
  // VP activation tx, absent during PENDING). PENDING gates on min-depth;
  // EXPIRED gates on `tRefund` for the Refund action. Each has its own
  // cache (depth/maturity never rewinds → drop cached txids from polling).
  const { config, getOffchainParamsByVersion } = useProtocolParamsContext();
  const [confirmedTxids, setConfirmedTxids] = useState<Set<string>>(
    loadConfirmedPrePeginTxids,
  );
  // Symmetric to `confirmedTxids` but for EXPIRED vaults past `tRefund`:
  // maturity, like depth, never rewinds, so once we've seen the count we
  // can drop the txid from the poll set forever (within TTL).
  const [matureRefundTxids, setMatureRefundTxids] = useState<Set<string>>(
    loadMatureRefundTxids,
  );
  // EXPIRED vaults whose HTLC spend confirmed (refund landed). A confirmed
  // spend is terminal, so — like the caches above — drop the vault from the
  // poll set and keep rendering "Refunded" without re-probing.
  const [refundedHtlcVaultIds, setRefundedHtlcVaultIds] = useState<Set<string>>(
    loadRefundedHtlcVaultIds,
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

  // Optimistic overrides (set immediately on user action) take precedence
  // over `pendingPegins` so the filter correctly skips a just-PAYOUT_SIGNED
  // vault even before localStorage syncs back. Mirrors `resolveLocalStatus`
  // used by `getPollingResult` below.
  const localStatusById = useMemo(() => {
    const map = new Map<string, LocalStorageStatus>();
    for (const p of pendingPegins) {
      if (p.status) map.set(p.id, p.status);
    }
    for (const [id, status] of optimisticStatuses) {
      map.set(id, status);
    }
    return map;
  }, [pendingPegins, optimisticStatuses]);

  const relevantPrePeginTxids = useMemo(
    () =>
      activities
        .filter((a) => {
          // Unowned vaults can't be signed by the current wallet → skip
          // polling. The card is dimmed via the ownership-mismatch tooltip.
          if (!isVaultOwnedByWallet(a.depositorBtcPubkey, btcPublicKey))
            return false;
          const status = (a.contractStatus ?? 0) as ContractStatus;
          if (status === ContractStatus.EXPIRED) {
            // Once a vault is past `tRefund`, polling adds no new info
            // (the cache below is authoritative for the consumer too).
            const txid = canonicalizeTxid(a.prePeginTxHash);
            return !(txid && matureRefundTxids.has(txid));
          }
          if (status !== ContractStatus.PENDING) return false;
          if (!isPrePeginPollEligibleStatus(localStatusById.get(a.id)))
            return false;
          const txid = canonicalizeTxid(a.prePeginTxHash);
          return !(txid && confirmedTxids.has(txid));
        })
        .map((a) => a.prePeginTxHash),
    [
      activities,
      localStatusById,
      confirmedTxids,
      matureRefundTxids,
      btcPublicKey,
    ],
  );
  const { confirmationsByTxid: prePeginConfirmationsByTxid } =
    useBtcMempoolConfirmations(
      relevantPrePeginTxids,
      PREPEGIN_CONFIRMATIONS_QUERY_KEY,
    );

  // Probe whether each EXPIRED+owned vault's HTLC output is already spent
  // (refund landed). A pure BTC refund emits no Ethereum event, so the indexer
  // never sees it — read it from Bitcoin directly. Drop vaults already known
  // refunded (confirmed-spend cache) from the set.
  const htlcRefundOutpoints = useMemo(
    () =>
      activities
        .filter((a) => {
          if (!isVaultOwnedByWallet(a.depositorBtcPubkey, btcPublicKey))
            return false;
          if ((a.contractStatus ?? 0) !== ContractStatus.EXPIRED) return false;
          if (refundedHtlcVaultIds.has(a.id.toLowerCase())) return false;
          return (
            !!a.prePeginTxHash &&
            a.htlcVout !== undefined &&
            Number.isInteger(a.htlcVout)
          );
        })
        // `htlcVout` is indexer-sourced and drives the DISPLAY poll only (a wrong
        // vout → at worst mislabel/hide the refund, recoverable via cache TTL);
        // the broadcast path re-reads htlcVout from chain, so no wrong tx signs.
        .map((a) => ({
          depositId: a.id,
          prePeginTxHash: a.prePeginTxHash as string,
          htlcVout: a.htlcVout as number,
        })),
    [activities, btcPublicKey, refundedHtlcVaultIds],
  );
  const { refundByDepositId: htlcRefundByDepositId } = useBtcHtlcRefundStatus(
    htlcRefundOutpoints,
    HTLC_REFUND_QUERY_KEY,
  );

  // Persist newly-confirmed observations and drop them from the next
  // poll set. Side effects sit outside the updater so StrictMode's
  // double-invoke doesn't double-write; the early return prevents
  // re-fires after the cache grows.
  useEffect(() => {
    if (prePeginConfirmationsByTxid.size === 0) return;
    const newlyConfirmed = getTxidsCrossingThreshold(
      activities,
      prePeginConfirmationsByTxid,
      confirmedTxids,
      () => true,
      getRequiredPrePeginDepth,
    );
    if (newlyConfirmed.length === 0) return;
    newlyConfirmed.forEach(addConfirmedPrePeginTxid);
    setConfirmedTxids((prev) => {
      const next = new Set(prev);
      newlyConfirmed.forEach((txid) => next.add(txid));
      return next;
    });
  }, [
    prePeginConfirmationsByTxid,
    activities,
    confirmedTxids,
    getRequiredPrePeginDepth,
  ]);

  // Symmetric pass for EXPIRED past `tRefund`. Vaults without a known
  // `refundTimelock` stay in the poll set (strict, never false-positive).
  useEffect(() => {
    if (prePeginConfirmationsByTxid.size === 0) return;
    const newlyMature = getTxidsCrossingThreshold(
      activities,
      prePeginConfirmationsByTxid,
      matureRefundTxids,
      (a) => (a.contractStatus ?? 0) === ContractStatus.EXPIRED,
      (a) =>
        a.offchainParamsVersion !== undefined
          ? getOffchainParamsByVersion(a.offchainParamsVersion)?.tRefund
          : undefined,
    );
    if (newlyMature.length === 0) return;
    newlyMature.forEach(addMatureRefundTxid);
    setMatureRefundTxids((prev) => {
      const next = new Set(prev);
      newlyMature.forEach((txid) => next.add(txid));
      return next;
    });
  }, [
    prePeginConfirmationsByTxid,
    activities,
    matureRefundTxids,
    getOffchainParamsByVersion,
  ]);

  // Persist vaults whose HTLC spend has confirmed and drop them from the next
  // poll set. Only confirmed spends are cached (a mempool-only spend can still
  // be replaced/reorged); the live map drives the transient "Refunding" state.
  useEffect(() => {
    if (htlcRefundByDepositId.size === 0) return;
    const newlyRefunded: string[] = [];
    for (const [depositId, spend] of htlcRefundByDepositId) {
      if (spend.confirmed && !refundedHtlcVaultIds.has(depositId)) {
        newlyRefunded.push(depositId);
      }
    }
    if (newlyRefunded.length === 0) return;
    newlyRefunded.forEach(addRefundedHtlcVaultId);
    setRefundedHtlcVaultIds((prev) => {
      const next = new Set(prev);
      newlyRefunded.forEach((id) => next.add(id));
      return next;
    });
  }, [htlcRefundByDepositId, refundedHtlcVaultIds]);

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

  // Confirmed settled refund: persist to the cache AND update the in-memory set
  // so `refundConfirmed` flips to "Refunded" this session, not just on reload.
  // Lowercased to match the `depositId.toLowerCase()` lookup in the poll result.
  const addConfirmedRefund = useCallback((depositId: string) => {
    addRefundedHtlcVaultId(depositId);
    const key = depositId.toLowerCase();
    setRefundedHtlcVaultIds((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  // Wrapper: depositId → activity, resolve per-vault thresholds, then
  // hand off to the pure decision tree in `computeDepositPollingResult`.
  const getPollingResult = useCallback(
    (depositId: string): DepositPollingResult | undefined => {
      // God-mode demo ids resolve to their controlled result, bypassing the
      // live polling tree (the demo is never in `activities`, so it is never
      // polled). No-op in production (demo is null).
      const demoResult = demo?.resultsById.get(depositId);
      if (demoResult) return demoResult;

      const activity = activities.find((a) => a.id === depositId);
      if (!activity) return undefined;
      // Strict: a since-lowered latest `tRefund` could mark a vault
      // mature early → Bitcoin rejects with `non-BIP68-final`.
      const refundTimelock =
        activity.offchainParamsVersion !== undefined
          ? getOffchainParamsByVersion(activity.offchainParamsVersion)?.tRefund
          : undefined;
      return computeDepositPollingResult({
        activity,
        pendingPegins,
        pendingDepositorSignatures,
        errors,
        needsWotsKey,
        pendingIngestion,
        prePeginConfirmationsByTxid,
        confirmedTxids,
        matureRefundTxids,
        htlcRefundByDepositId,
        refundedHtlcVaultIds,
        requiredDepth: getRequiredPrePeginDepth(activity),
        refundTimelock,
        isLoading,
        optimisticStatuses,
        optimisticRefundBroadcastAt,
        btcPublicKey,
      });
    },
    [
      demo,
      activities,
      pendingPegins,
      pendingDepositorSignatures,
      errors,
      needsWotsKey,
      pendingIngestion,
      prePeginConfirmationsByTxid,
      confirmedTxids,
      matureRefundTxids,
      htlcRefundByDepositId,
      refundedHtlcVaultIds,
      getRequiredPrePeginDepth,
      getOffchainParamsByVersion,
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
      addConfirmedRefund,
    }),
    [
      getPollingResult,
      isLoading,
      refetch,
      setOptimisticStatus,
      clearOptimisticStatus,
      addConfirmedRefund,
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
 * Non-throwing variant: returns the context if available, else `null`.
 * Use this when a component might render outside the dashboard's
 * PeginPollingProvider (e.g. the active deposit flow modal), so it can
 * gracefully fall back instead of crashing.
 */
export function usePeginPollingOptional(): PeginPollingContextValue | null {
  return useContext(PeginPollingContext) ?? null;
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

/**
 * Returns the first deposit-polling result that is indexed for any of the
 * given deposit ids, or `undefined` if none are indexed (or the polling
 * context isn't mounted). Multi-vault batches share one broadcast txid so
 * any indexed sibling carries the same confirmation count — picking the
 * first indexed one avoids missing the data when one sibling is still
 * propagating through the indexer.
 */
export function useOptionalDepositPollingResult(
  depositIds: readonly string[],
): DepositPollingResult | undefined {
  const polling = usePeginPollingOptional();
  if (!polling) return undefined;
  for (const id of depositIds) {
    const result = polling.getPollingResult(id);
    if (result) return result;
  }
  return undefined;
}

// Re-export types for external use
export type { DepositPollingResult } from "../../types/peginPolling";
