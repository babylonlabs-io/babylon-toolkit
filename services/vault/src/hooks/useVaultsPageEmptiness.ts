/**
 * useVaultsPageEmptiness hook
 *
 * Emptiness predicate for the v3 /vaults page: `isEmpty` is true when the
 * account has nothing to show in any vault lifecycle section — no collateral
 * vaults (including optimistic activating rows) and no pending or refundable
 * expired deposits. A disconnected or partially connected session (BTC or
 * ETH wallet missing) is always "empty" regardless of what the ETH-keyed
 * queries returned, so the page shows the connect prompt.
 *
 * `isLoading` guards against flashing the empty state before the position
 * and deposit queries resolve; it is false while disconnected.
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
 * Withdrawal-only positions (every vault redeemed, pegout still in flight)
 * are not yet consulted; the withdrawal sections join the page with the
 * relocation step of issue #2041.
 *
 * The deposit lists arrive as a parameter — the page's single
 * `usePendingDeposits` result, shared with VaultsLifecycleSections — so this
 * hook never instantiates a second broadcast/refund modal state pair.
 */

import { useConnection, useETHWallet } from "@/context/wallet";
import { useDashboardState } from "@/hooks/useDashboardState";
import type { VaultActivity } from "@/types/activity";

interface VaultsPageDeposits {
  pendingActivities: VaultActivity[];
  expiredActivities: VaultActivity[];
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
  } = useDashboardState(isConnected ? address : undefined);
  const {
    pendingActivities,
    expiredActivities,
    isLoading: isDepositsLoading,
    error: depositsError,
  } = deposits;

  const isLoading = isConnected && (isPositionLoading || isDepositsLoading);
  const hasAnythingToShow =
    hasDisplayCollateral ||
    pendingActivities.length > 0 ||
    expiredActivities.length > 0;
  const anySourceFailed = positionError !== null || depositsError !== null;
  const hasError =
    isConnected && !isLoading && !hasAnythingToShow && anySourceFailed;
  const hasPartialError =
    isConnected && !isLoading && hasAnythingToShow && anySourceFailed;
  const isEmpty =
    !isLoading && !hasError && (!isConnected || !hasAnythingToShow);

  return { isLoading, isEmpty, hasError, hasPartialError };
}
