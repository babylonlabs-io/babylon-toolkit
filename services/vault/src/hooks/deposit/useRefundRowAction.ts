/**
 * useRefundRowAction — whether a list row may offer the HTLC refund.
 *
 * The Vaults page's inactive-vault row and the Activity feed's expired-deposit
 * row present the same protocol action, so they must agree on when it is
 * offered. That decision lives here rather than in either row (#2041):
 *
 *  - `available` — the refund can be performed now.
 *  - `blockedTooltip` — the refund is the row's action but is not performable
 *    yet; the row shows a disabled control explaining why. Null once a refund
 *    is in flight or settled, which leaves the row with no action at all
 *    rather than a permanently disabled button.
 *
 * Must be called inside a PeginPollingProvider — it reads that deposit's poll
 * result.
 */

import { getActionStatus } from "@/components/deposit/actionStatus";
import { useDepositPollingResult } from "@/context/deposit/PeginPollingContext";
import {
  isRefundInFlightOrSettled,
  PeginAction,
} from "@/models/peginStateMachine";

export interface RefundRowAction {
  available: boolean;
  blockedTooltip: string | null;
}

export function useRefundRowAction(vaultId: string): RefundRowAction {
  const result = useDepositPollingResult(vaultId);
  const actionStatus: ReturnType<typeof getActionStatus> = result
    ? getActionStatus(result)
    : { type: "noAction" };

  if (
    actionStatus.type === "available" &&
    actionStatus.action.action === PeginAction.REFUND_HTLC
  ) {
    return { available: true, blockedTooltip: null };
  }

  const isBlocked =
    actionStatus.type === "disabled" &&
    actionStatus.action?.action === PeginAction.REFUND_HTLC &&
    !(result?.peginState
      ? isRefundInFlightOrSettled(result.peginState)
      : false);

  return {
    available: false,
    blockedTooltip: isBlocked ? actionStatus.tooltip : null,
  };
}
