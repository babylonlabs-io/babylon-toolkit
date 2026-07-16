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
 * Withdrawal-only positions (every vault redeemed, pegout still in flight)
 * are not yet consulted; the withdrawal sections join the page with the
 * relocation step of issue #2041.
 */

import { useConnection, useETHWallet } from "@/context/wallet";
import { useDashboardState } from "@/hooks/useDashboardState";
import { usePendingDeposits } from "@/hooks/usePendingDeposits";

export function useVaultsPageEmptiness(): {
  isLoading: boolean;
  isEmpty: boolean;
  hasError: boolean;
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
  } = usePendingDeposits();

  const isLoading = isConnected && (isPositionLoading || isDepositsLoading);
  const hasAnythingToShow =
    hasDisplayCollateral ||
    pendingActivities.length > 0 ||
    expiredActivities.length > 0;
  const hasError =
    isConnected &&
    !isLoading &&
    !hasAnythingToShow &&
    (positionError !== null || depositsError !== null);
  const isEmpty =
    !isLoading && !hasError && (!isConnected || !hasAnythingToShow);

  return { isLoading, isEmpty, hasError };
}
