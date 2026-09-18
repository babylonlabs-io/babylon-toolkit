/**
 * useVaultsPageEmptiness hook
 *
 * Emptiness predicate for the v3 /vaults page: `isEmpty` is true when the
 * account has nothing to show in any vault lifecycle section — no collateral
 * vaults (including optimistic activating rows), no pending deposits, no
 * refundable expired deposits and no reclaimable settled vaults. A deposit whose
 * refund or reclaim is already done renders no row, so it counts for nothing
 * here either: both sides read `useActionableExpiredDeposits` and
 * `useActionableReclaims`. A disconnected or partially connected session (BTC or
 * ETH wallet missing) is always "empty" regardless of what the ETH-keyed queries
 * returned, so the page shows the connect prompt.
 *
 * `isLoading` guards against flashing the empty state before the position and
 * deposit queries resolve. An unresolved reclaim read holds it too, but only
 * while nothing else is showable: eligibility fails closed, so a candidate with
 * no verdict yet reads as nothing left to do and would empty the page, whereas
 * an account with collateral or pending deposits has a page to render and the
 * settled row simply arrives when its reads land. It is false while
 * disconnected.
 *
 * `hasError` is true when a connected session has nothing to show AND either
 * query failed — an empty account must never be claimed on the back of a
 * failed read (an RPC/indexer outage would otherwise render "no vaults" to
 * a depositor with real collateral). Data from the other source wins over
 * an error: if anything is showable, the page is simply not empty.
 *
 * `hasPartialError` covers the complement of that preference: something IS
 * showable but one of the sources still failed. The page renders the data it
 * has, and this flag drives a warning so the failure is never silent — a
 * failed position read would otherwise present fallback (zero) collateral
 * totals as real, and a failed deposits read would silently drop pending or
 * refundable rows.
 *
 * A withdrawal-only position (every vault redeemed, peg-out still in flight)
 * is not empty: the indexer has already zeroed the collateral figure, but the
 * withdrawing rows are still shown, so `hasDisplayCollateral` keeps the page
 * populated until the payouts settle.
 *
 * The deposit lists arrive as a parameter — the page's single
 * `usePendingDeposits` result, shared with VaultsLifecycleSections — so this
 * hook never instantiates a second broadcast/refund modal state pair. The
 * reclaim reads it does repeat resolve against the query cache the section
 * already fills, so they cost no extra requests.
 */

import { useConnection, useETHWallet } from "@/context/wallet";
import { useActionableExpiredDeposits } from "@/hooks/deposit/useActionableExpiredDeposits";
import {
  NO_RECLAIMS_IN_FLIGHT,
  useActionableReclaims,
} from "@/hooks/deposit/useActionableReclaims";
import { useDashboardState } from "@/hooks/useDashboardState";
import type { VaultActivity } from "@/types/activity";

interface VaultsPageDeposits {
  pendingActivities: VaultActivity[];
  expiredActivities: VaultActivity[];
  reclaimableCandidates: VaultActivity[];
  isLoading: boolean;
  error: Error | null;
}

export function useVaultsPageEmptiness(deposits: VaultsPageDeposits): {
  isLoading: boolean;
  isEmpty: boolean;
  hasError: boolean;
  hasPartialError: boolean;
} {
  const { address } = useETHWallet();
  const { isConnected } = useConnection();
  const {
    hasDisplayCollateral,
    isLoading: isPositionLoading,
    positionError,
    indexerError,
  } = useDashboardState(isConnected ? address : undefined);
  const {
    pendingActivities,
    expiredActivities,
    reclaimableCandidates,
    isLoading: isDepositsLoading,
    error: depositsError,
  } = deposits;

  const actionableExpiredActivities =
    useActionableExpiredDeposits(expiredActivities);
  const { candidates: actionableReclaims, isResolving: isReclaimResolving } =
    useActionableReclaims(reclaimableCandidates, NO_RECLAIMS_IN_FLIGHT);

  const hasAnythingToShow =
    hasDisplayCollateral ||
    pendingActivities.length > 0 ||
    actionableExpiredActivities.length > 0 ||
    actionableReclaims.length > 0;
  const isLoading =
    isConnected &&
    (isPositionLoading ||
      isDepositsLoading ||
      (isReclaimResolving && !hasAnythingToShow));
  const anySourceFailed = Boolean(
    positionError || indexerError || depositsError,
  );
  const hasError =
    isConnected && !isLoading && !hasAnythingToShow && anySourceFailed;
  const hasPartialError =
    isConnected && !isLoading && hasAnythingToShow && anySourceFailed;
  const isEmpty =
    !isLoading && !hasError && (!isConnected || !hasAnythingToShow);

  return { isLoading, isEmpty, hasError, hasPartialError };
}
