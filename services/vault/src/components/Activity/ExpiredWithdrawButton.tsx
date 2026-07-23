/**
 * ExpiredWithdrawButton
 * The Withdraw action on an expired deposit's activity row. Performs the HTLC
 * refund, gated exactly as the Vaults page's inactive-vault row is (#2041): the
 * button only surfaces while the refund is actually available, and renders
 * disabled-with-tooltip while it is blocked but not yet in flight. Must be
 * rendered inside a PeginPollingProvider — it reads that deposit's poll result.
 */

import { Hint } from "@babylonlabs-io/core-ui";

import { getActionStatus } from "@/components/deposit/actionStatus";
import {
  ERROR_ROW_BUTTON_CLASS,
  NEUTRAL_ROW_BUTTON_CLASS,
} from "@/components/shared/buttonClasses";
import { useDepositPollingResult } from "@/context/deposit/PeginPollingContext";
import { COPY } from "@/copy";
import {
  isRefundInFlightOrSettled,
  PeginAction,
} from "@/models/peginStateMachine";

interface ExpiredWithdrawButtonProps {
  /** Vault id of the expired deposit — the refund modal's lookup key. */
  vaultId: string;
  onWithdraw: (vaultId: string) => void;
}

export function ExpiredWithdrawButton({
  vaultId,
  onWithdraw,
}: ExpiredWithdrawButtonProps) {
  const result = useDepositPollingResult(vaultId);
  const actionStatus: ReturnType<typeof getActionStatus> = result
    ? getActionStatus(result)
    : { type: "noAction" };

  if (
    actionStatus.type === "available" &&
    actionStatus.action.action === PeginAction.REFUND_HTLC
  ) {
    return (
      <button
        type="button"
        onClick={() => onWithdraw(vaultId)}
        className={ERROR_ROW_BUTTON_CLASS}
      >
        {COPY.vaults.actions.withdraw}
      </button>
    );
  }

  const isBlocked =
    actionStatus.type === "disabled" &&
    actionStatus.action?.action === PeginAction.REFUND_HTLC &&
    !(result?.peginState
      ? isRefundInFlightOrSettled(result.peginState)
      : false);

  if (!isBlocked) return null;

  return (
    <Hint tooltip={actionStatus.tooltip} attachToChildren>
      <button type="button" disabled className={NEUTRAL_ROW_BUTTON_CLASS}>
        {COPY.vaults.actions.withdraw}
      </button>
    </Hint>
  );
}
