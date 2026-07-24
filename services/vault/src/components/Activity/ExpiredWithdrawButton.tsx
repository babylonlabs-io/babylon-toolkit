/**
 * ExpiredWithdrawButton
 * The Withdraw action on an expired deposit's activity row. Performs the HTLC
 * refund, offered on exactly the terms the Vaults page's inactive-vault row
 * uses — both read `useRefundRowAction`, so the two cannot drift. Must be
 * rendered inside a PeginPollingProvider, which that hook requires.
 */

import { Hint } from "@babylonlabs-io/core-ui";

import {
  ERROR_ROW_BUTTON_CLASS,
  NEUTRAL_ROW_BUTTON_CLASS,
} from "@/components/shared/buttonClasses";
import { COPY } from "@/copy";
import { useRefundRowAction } from "@/hooks/deposit/useRefundRowAction";

interface ExpiredWithdrawButtonProps {
  /** Vault id of the expired deposit — the refund modal's lookup key. */
  vaultId: string;
  onWithdraw: (vaultId: string) => void;
}

export function ExpiredWithdrawButton({
  vaultId,
  onWithdraw,
}: ExpiredWithdrawButtonProps) {
  const { available, blockedTooltip } = useRefundRowAction(vaultId);

  if (available) {
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

  if (!blockedTooltip) return null;

  return (
    <Hint tooltip={blockedTooltip} attachToChildren>
      <button type="button" disabled className={NEUTRAL_ROW_BUTTON_CLASS}>
        {COPY.vaults.actions.withdraw}
      </button>
    </Hint>
  );
}
