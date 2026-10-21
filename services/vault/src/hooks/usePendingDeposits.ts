/**
 * usePendingDeposits hook
 *
 * Fetches vault deposits and splits them into two lists:
 *  - pendingActivities: in-flight deposits (contractStatus 0=PENDING or 1=VERIFIED).
 *  - expiredActivities: refundable expired deposits (contractStatus 7=EXPIRED with
 *    unsignedPrePeginTx — the only indexer-sourced field required to build the
 *    refund PSBT; hashlock and htlcVout come from the on-chain contract).
 *  - reclaimableCandidates: settled deposits (contractStatus 6=DEPOSITOR_WITHDRAWN or 8=NON_DEPOSITOR_SPEND)
 *    whose depositor-claim reserve may still be unspent. Candidates only —
 *    eligibility is decided on Bitcoin, not from this status.
 * Provides wallet state and modal handlers for refund and recovery actions on
 * pending and expired deposits. Every other per-vault action (Pre-PegIn
 * broadcast, WOTS, payout signing, activation, artifact download) is owned by
 * the deposit multistepper, not per-action modals.
 *
 * Polling infrastructure moved to `AppPeginPollingProvider`.
 */

import { useMemo } from "react";
import type { Address } from "viem";

import { selectPendingActivities } from "@/context/deposit/pendingDepositCount";
import { useBTCWallet, useETHWallet } from "@/context/wallet";
import { useAllDepositProviders } from "@/hooks/deposit/useAllDepositProviders";
import { useClaimExpiredModal } from "@/hooks/deposit/useClaimExpiredModal";
import { useEmergencyWithdrawModal } from "@/hooks/deposit/useEmergencyWithdrawModal";
import { useReclaimModal } from "@/hooks/deposit/useReclaimModal";
import { useRefundModal } from "@/hooks/deposit/useRefundModal";
import { useVaultDeposits } from "@/hooks/useVaultDeposits";
import { ContractStatus } from "@/models/peginStateMachine";
import { useDepositOverride } from "@/overrides/deposits";

/**
 * Indexer statuses at which the vault output is spent, so the depositor's
 * claim graph is moot and the PegIn vout 1 reserve is theirs to sweep: paid
 * out by the vault provider (DEPOSITOR_WITHDRAWN) or claimed by a vault keeper
 * (NON_DEPOSITOR_SPEND). Candidates only; `getReclaimEligibility` decides.
 */
const RECLAIM_CANDIDATE_STATUSES: ReadonlySet<ContractStatus> = new Set([
  ContractStatus.DEPOSITOR_WITHDRAWN,
  ContractStatus.NON_DEPOSITOR_SPEND,
]);

export function usePendingDeposits() {
  const { connected: btcConnected, address: btcAddress } = useBTCWallet();
  const { address: ethAddress } = useETHWallet();

  const {
    activities,
    refetchActivities,
    loading,
    error,
    storageReadError,
    removePendingPegins,
    indexedVaultIds,
    localRecordStatuses,
  } = useVaultDeposits(ethAddress as Address | undefined);

  const { vaultProviders } = useAllDepositProviders(activities);

  // God-mode demo deposit (dev only; null unless NEXT_PUBLIC_FF_GOD_MODE_PANEL
  // is on and enabled). Injected into the render lists below — but NOT into
  // `allActivities` — so the real section renders it while it is never polled.
  // Refund click handlers resolve ids against `allActivities` and so
  // no-op for it; only the activation walk opts in, by resolving demo ids from
  // the `demo` aggregate returned below (see PendingDepositSection). When
  // `demo.hideReal` is set, the real deposits are dropped from the render lists
  // so only the demo shows. Inert in production.
  const demo = useDepositOverride();

  const pendingActivities = useMemo(
    () => selectPendingActivities(activities, demo),
    [activities, demo],
  );

  const expiredActivities = useMemo(() => {
    const real = activities.filter(
      (a) =>
        a.contractStatus === ContractStatus.EXPIRED && !!a.unsignedPrePeginTx,
    );
    if (!demo) return real;
    return [...demo.expiredActivities, ...(demo.hideReal ? [] : real)];
  }, [activities, demo]);

  // Settled vaults whose depositor-claim reserve may still be sitting at PegIn
  // vout 1. Candidates only: this is the cheap pre-filter that decides which
  // vaults are worth probing on Bitcoin. Whether the reserve is actually
  // reclaimable is decided by `getReclaimEligibility` against the chain reads,
  // and gating on the contract status alone would be unsafe — see the warning
  // in `models/reclaimEligibility`.
  //
  // `depositorSignedPeginTx` here is the indexer's copy, used only to derive
  // the txid the poller probes. The signing path re-reads it from the contract
  // (`vaultReclaimService`); a wrong value here can at worst mislabel a row.
  const reclaimableCandidates = useMemo(
    () =>
      activities.filter(
        (a) =>
          a.contractStatus !== undefined &&
          RECLAIM_CANDIDATE_STATUSES.has(a.contractStatus) &&
          !!a.depositorSignedPeginTx,
      ),
    [activities],
  );

  const mergedVaultProviders = useMemo(
    () => (demo ? [demo.provider, ...vaultProviders] : vaultProviders),
    [demo, vaultProviders],
  );

  const refundModal = useRefundModal({
    allActivities: activities,
    onSuccess: refetchActivities,
  });

  const reclaimModal = useReclaimModal({
    allActivities: activities,
    onSuccess: refetchActivities,
  });

  const emergencyWithdrawModal = useEmergencyWithdrawModal({
    allActivities: activities,
    onSuccess: refetchActivities,
  });

  const claimExpiredModal = useClaimExpiredModal({
    allActivities: activities,
    onSuccess: refetchActivities,
  });

  return {
    pendingActivities,
    expiredActivities,
    reclaimableCandidates,
    allActivities: activities,
    vaultProviders: mergedVaultProviders,
    btcAddress,
    btcConnected,
    ethAddress,
    hasPendingDeposits: btcConnected && pendingActivities.length > 0,
    hasExpiredDeposits: btcConnected && expiredActivities.length > 0,
    isLoading: loading,
    error,
    storageReadError,
    refetchActivities,
    /**
     * Discards browser-local pending deposits in one storage write — the whole
     * batch of a split deposit at once. Returns the failure reason when the
     * records are still stored.
     */
    removePendingPegins,
    /**
     * Lowercased ids of every vault the indexer returned, or null unless that
     * set is known to be complete (answered successfully, no error, no dropped
     * rows).
     */
    indexedVaultIds,
    /**
     * Stored status of each browser-local record, keyed by lowercased vault id.
     */
    localRecordStatuses,
    refundModal,
    reclaimModal,
    emergencyWithdrawModal,
    claimExpiredModal,
    // God-mode demo aggregate (null in production). Only the activation-walk
    // click routing reads it; every other consumer uses the real lists above.
    demo,
  };
}
