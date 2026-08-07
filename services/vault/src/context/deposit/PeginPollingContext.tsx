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
  useSyncExternalStore,
} from "react";
import type { Hex } from "viem";

import { useDemoDeposit } from "@/dev/demoDeposit";
import { logger } from "@/infrastructure";
import { shortId, TELEMETRY_EVENT } from "@/infrastructure/telemetryEvents";

import { usePeginPollingProtocolParams } from "../../hooks/deposit/usePeginPollingProtocolParams";
import { usePeginPollingQuery } from "../../hooks/deposit/usePeginPollingQuery";
import { useSigningRequiredNotifications } from "../../hooks/deposit/useSigningRequiredNotifications";
import { useActivationDeadlineGate } from "../../hooks/useActivationDeadlineGate";
import { useBtcHtlcRefundStatus } from "../../hooks/useBtcHtlcRefundStatus";
import { useBtcMempoolConfirmations } from "../../hooks/useBtcMempoolConfirmations";
import { useStuckVaultChainConfirm } from "../../hooks/useStuckVaultChainConfirm";
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

import { computeDepositPollingResult } from "./computeDepositPollingResult";
import {
  collectDaemonTerminalEvents,
  getSharedDaemonTerminalTracking,
} from "./daemonTerminalEvents";
import {
  getOptimisticDepositState,
  setOptimisticDepositStatus,
  subscribeToOptimisticDepositState,
} from "./optimisticDepositState";
import {
  collectTerminalMilestones,
  getSharedTerminalMilestoneTracking,
} from "./terminalMilestones";

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
 * Live `PeginPollingProvider` mounts. Module-level so the invariant below
 * catches siblings as well as nesting — a `useContext` check would only see a
 * provider above it, and two providers mounted side by side fork state just as
 * badly as two nested ones.
 */
let mountedProviderCount = 0;

/** Only ever exceeded by a second mount; see {@link useSingleProviderInvariant}. */
const MAX_CONCURRENT_PROVIDERS = 1;

/**
 * Fails loudly in development if a second provider mounts.
 *
 * Two providers fork both the VP poll and the optimistic-completion reads, so
 * an action completed under one is invisible to a row rendered under the other.
 * That is silent at runtime and produces a UI that keeps offering an action the
 * user already performed — the bug this tree was collapsed to remove.
 *
 * Throws in dev so it cannot be ignored; logs in production, where crashing a
 * depositor mid-flow over a structural invariant would be the worse outcome.
 * StrictMode is safe: its setup → cleanup → setup for one component nets to 1.
 */
function useSingleProviderInvariant(): void {
  useEffect(() => {
    mountedProviderCount += 1;
    if (mountedProviderCount > MAX_CONCURRENT_PROVIDERS) {
      const message =
        `${mountedProviderCount} PeginPollingProvider instances are mounted at once. ` +
        "The app must mount exactly one, via AppPeginPollingProvider — a second " +
        "instance forks polling and optimistic-completion state, so a completed " +
        "action stops hiding its own button.";
      if (import.meta.env.DEV) {
        // An effect setup that throws never registers its cleanup, so undo
        // this mount's increment first — otherwise the counter stays elevated
        // for the rest of the session and a corrected tree keeps tripping the
        // invariant on every HMR update until a full reload.
        mountedProviderCount -= 1;
        throw new Error(message);
      }
      logger.error(new Error(message), { tags: { area: "pegin-polling" } });
    }
    return () => {
      mountedProviderCount -= 1;
    };
  }, []);
}

/** Test-only: reset the mount counter between renders. */
export function resetPeginPollingProviderCount(): void {
  mountedProviderCount = 0;
}

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
  useSingleProviderInvariant();

  // God-mode demo deposit (dev only; null unless NEXT_PUBLIC_FF_GOD_MODE_PANEL
  // is on and the panel toggle is enabled). When present, its ids resolve to
  // controlled results below instead of the live polling decision tree.
  const demo = useDemoDeposit();

  // Optimistic step completions (for immediate UI feedback after an action).
  // App-scoped, not provider-scoped: the writers run outside the context
  // surface, and the provider itself still unmounts (geo-block branch, wallet
  // churn). See `optimisticDepositState`.
  const {
    statuses: optimisticStatuses,
    refundBroadcastAt: optimisticRefundBroadcastAt,
    wotsSubmittedAt,
  } = useSyncExternalStore(
    subscribeToOptimisticDepositState,
    getOptimisticDepositState,
    getOptimisticDepositState,
  );

  // Use the polling query hook
  const {
    polledIds,
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
  // Non-blocking: this provider is mounted above the routes that own the
  // blocking ProtocolParamsProvider, so it reads the same queries directly
  // rather than depending on a context that renders a spinner in place of its
  // children. Params resolve to `undefined` until loaded — never a default.
  // Gated on having deposits to evaluate: the provider mounts app-wide, and
  // ungated queries would bill two multicalls to every session on page load,
  // connected or not — the pre-hoist footprint only paid them when a pending
  // section actually rendered.
  const params = usePeginPollingProtocolParams(activities.length > 0);
  // Tiered (Tier-1 estimate → Tier-2 chain confirm) activation-deadline gate.
  // Lowercased ids of VERIFIED vaults confirmed past their activation window.
  // Fails safe on an undefined timeout (gate stays closed until params land).
  const activationDeadlinePassedIds = useActivationDeadlineGate(
    activities,
    params.pegInActivationTimeout,
  );
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

  const { resolveRequiredPrePeginDepth, resolveRefundTimelock } = params;
  const getRequiredPrePeginDepth = useCallback(
    (activity: VaultActivity): number | undefined =>
      resolveRequiredPrePeginDepth(activity.offchainParamsVersion),
    [resolveRequiredPrePeginDepth],
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

  // Probe whether each owned EXPIRED or VERIFIED vault's HTLC output is
  // already spent. Neither spend emits an Ethereum event, so the indexer
  // never sees them — read Bitcoin directly. For EXPIRED vaults a spend is
  // the refund landing; for VERIFIED vaults it is the stuck-state signal
  // (peg-in swept without activation → activate-and-redeem escape hatch).
  // Drop vaults already known refunded (confirmed-spend cache) from the set.
  const htlcRefundOutpoints = useMemo(
    () =>
      activities
        .filter((a) => {
          if (!isVaultOwnedByWallet(a.depositorBtcPubkey, btcPublicKey))
            return false;
          const status = (a.contractStatus ?? 0) as ContractStatus;
          if (
            status !== ContractStatus.EXPIRED &&
            status !== ContractStatus.VERIFIED
          )
            return false;
          // Once this device has submitted the reveal (CONFIRMED), a spend is
          // the expected VP sweep, not the stuck state — and the display
          // ignores the probe anyway, so skip the request. This is a local
          // request-saving shortcut ONLY: it is per-device, so it says nothing
          // on a second device or a cleared profile. What actually decides the
          // stuck state is the on-chain confirmation below.
          if (
            status === ContractStatus.VERIFIED &&
            localStatusById.get(a.id) === LocalStorageStatus.CONFIRMED
          )
            return false;
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
    [activities, btcPublicKey, refundedHtlcVaultIds, localStatusById],
  );
  const { refundByDepositId: htlcRefundByDepositId } = useBtcHtlcRefundStatus(
    htlcRefundOutpoints,
    HTLC_REFUND_QUERY_KEY,
  );

  // Tier-1 stuck suspects: VERIFIED (per the indexer) with the HTLC proven
  // swept by the pegin tx. Cheap — it reuses the probe above and adds no
  // request. Tier 2 confirms each against the chain, because that BTC evidence
  // is equally consistent with a healthy deposit whose activation the indexer
  // has not caught up to yet.
  const stuckSuspectIds = useMemo(() => {
    const ids: Hex[] = [];
    for (const a of activities) {
      if (
        ((a.contractStatus ?? 0) as ContractStatus) !== ContractStatus.VERIFIED
      )
        continue;
      const spend = htlcRefundByDepositId.get(a.id);
      if (spend?.spent !== true) continue;
      const peginTxCanonical = canonicalizeTxid(a.peginTxHash);
      if (
        peginTxCanonical === undefined ||
        canonicalizeTxid(spend.spendingTxid) !== peginTxCanonical
      ) {
        continue;
      }
      ids.push(a.id);
    }
    return ids;
  }, [activities, htlcRefundByDepositId]);

  const stuckConfirmedIds = useStuckVaultChainConfirm(stuckSuspectIds);

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
      (a) => resolveRefundTimelock(a.offchainParamsVersion),
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
    resolveRefundTimelock,
  ]);

  // Persist vaults whose HTLC spend has confirmed and drop them from the next
  // poll set. Only confirmed spends are cached (a mempool-only spend can still
  // be replaced/reorged); the live map drives the transient "Refunding" state.
  // EXPIRED vaults only: for them a confirmed spend IS the refund landing
  // (terminal). A VERIFIED vault's confirmed spend is the VP sweep of the
  // stuck state — caching it as "refunded" would mislabel the vault if it
  // later flips to EXPIRED, so those stay in the live poll.
  useEffect(() => {
    if (htlcRefundByDepositId.size === 0) return;
    const expiredIds = new Set(
      activities
        .filter(
          (a) =>
            ((a.contractStatus ?? 0) as ContractStatus) ===
            ContractStatus.EXPIRED,
        )
        .map((a) => a.id.toLowerCase()),
    );
    const newlyRefunded: string[] = [];
    for (const [depositId, spend] of htlcRefundByDepositId) {
      if (!expiredIds.has(depositId)) continue;
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
  }, [htlcRefundByDepositId, refundedHtlcVaultIds, activities]);

  // Emit the on-chain funnel terminals — activation.verified and
  // deposit.completed — once per vault as its contractStatus transitions. The
  // detector seeds already-terminal vaults on first observation, so a dashboard
  // load never emits a burst for prior-session completions. Tracking is
  // app-scoped rather than per-provider: the provider legitimately unmounts
  // and remounts (geo-block branch, wallet churn), and per-instance tracking
  // would re-count a terminal on every remount. (It also predates the
  // single-provider invariant above, when the continuation modal mounted a
  // second provider over the same vault.) It is a plain module store, not
  // state — emitting telemetry must not trigger a re-render.
  useEffect(() => {
    const milestones = collectTerminalMilestones(
      activities,
      getSharedTerminalMilestoneTracking(),
    );
    for (const milestone of milestones) {
      logger.event(milestone.event, {
        level: "info",
        category: milestone.category,
        tags: { vaultId: shortId(milestone.vaultId) },
      });
    }
  }, [activities]);

  // Emit activation.daemon.terminal once per (vault, daemonStatus) as the VP
  // daemon reports a terminal drop (Expired / AmlRejected / ...). These states
  // stop polling and previously transmitted nothing — a rejected deposit was
  // invisible. Same seeding rule and shared-store rationale as the milestone
  // effect above; runs only once a poll has resolved. `polledIds` is captured
  // inside the queryFn, so ids and errors are always the same poll's snapshot —
  // pairing the live `depositsToPoll` memo with `errors` instead would, under
  // `keepPreviousData`, seed new vaults (wallet switch, late-arriving
  // activities) against a stale map and later emit their pre-existing
  // terminals as fresh transitions.
  useEffect(() => {
    if (!polledIds || !errors) return;
    const terminalEvents = collectDaemonTerminalEvents(
      polledIds,
      errors,
      getSharedDaemonTerminalTracking(),
    );
    for (const terminal of terminalEvents) {
      logger.event(TELEMETRY_EVENT.ACTIVATION_DAEMON_TERMINAL, {
        level: "warning",
        category: "activation",
        tags: {
          vaultId: shortId(terminal.vaultId),
          daemonStatus: terminal.daemonStatus,
        },
      });
    }
  }, [polledIds, errors]);

  // Optimistic status handlers
  const setOptimisticStatus = useCallback(
    (
      depositId: string,
      newStatus: LocalStorageStatus,
      refundBroadcastAt?: number,
    ) => {
      setOptimisticDepositStatus(depositId, newStatus, refundBroadcastAt);
    },
    [],
  );

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
      const refundTimelock = resolveRefundTimelock(
        activity.offchainParamsVersion,
      );
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
        activationDeadlinePassed: activationDeadlinePassedIds.has(
          activity.id.toLowerCase(),
        ),
        stuckStateConfirmedOnChain: stuckConfirmedIds.has(
          activity.id.toLowerCase(),
        ),
        // Params still resolving is a loading state, not a resolved "depth
        // unknown" — otherwise a cold load reads as a stalled deposit. A params
        // *failure* is not: the queries have exhausted their retries and will
        // not resolve, so latching `loading` beside the error would park every
        // row on a spinner forever. Failed params present as failed.
        isLoading: isLoading || (!params.ready && !params.error),
        protocolParamsError: params.error,
        optimisticStatuses,
        optimisticRefundBroadcastAt,
        wotsSubmittedAt,
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
      resolveRefundTimelock,
      activationDeadlinePassedIds,
      stuckConfirmedIds,
      isLoading,
      params.ready,
      params.error,
      optimisticStatuses,
      optimisticRefundBroadcastAt,
      wotsSubmittedAt,
      btcPublicKey,
    ],
  );

  // Surface a browser notification when any polled deposit enters a
  // signing/action-required state while the user is on another tab.
  useSigningRequiredNotifications(activities, getPollingResult, btcPublicKey);

  const contextValue = useMemo(
    () => ({
      getPollingResult,
      isLoading,
      refetch: () => refetch(),
      setOptimisticStatus,
      addConfirmedRefund,
    }),
    [
      getPollingResult,
      isLoading,
      refetch,
      setOptimisticStatus,
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
 * given deposit ids, or `undefined` if none are indexed. Multi-vault batches
 * share one broadcast txid so any indexed sibling carries the same
 * confirmation count — picking the first indexed one avoids missing the data
 * when one sibling is still propagating through the indexer.
 *
 * A deposit is unindexed in the moments right after broadcast, before the
 * indexer has it; callers fall back to a direct mempool read there.
 */
export function useFirstIndexedDepositPollingResult(
  depositIds: readonly string[],
): DepositPollingResult | undefined {
  const { getPollingResult } = usePeginPolling();
  for (const id of depositIds) {
    const result = getPollingResult(id);
    if (result) return result;
  }
  return undefined;
}

// Re-export types for external use
export type { DepositPollingResult } from "../../types/peginPolling";
