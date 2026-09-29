/**
 * useActionableExpiredDeposits — the expired deposits that still have a refund
 * left to perform.
 *
 * An expired deposit whose refund is broadcast or settled has nothing the
 * depositor can act on, so it leaves the deposits page; `/activity` keeps the
 * record. Both the row list and the page-emptiness predicate read this hook, so
 * the rendered rows and the count the page is judged empty by cannot drift.
 */

import { useMemo } from "react";

import { usePeginPolling } from "@/context/deposit/PeginPollingContext";
import { isRefundInFlightOrSettled } from "@/models/peginStateMachine";
import type { VaultActivity } from "@/types/activity";

export function useActionableExpiredDeposits(
  expiredActivities: VaultActivity[],
): VaultActivity[] {
  const { getPollingResult } = usePeginPolling();
  return useMemo(
    () =>
      expiredActivities.filter((activity) => {
        const state = getPollingResult(activity.id)?.peginState;
        return !state || !isRefundInFlightOrSettled(state);
      }),
    [expiredActivities, getPollingResult],
  );
}
