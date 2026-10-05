/**
 * ExpiredWithdrawButton
 * The action on an expired deposit's activity row. Withdraw performs the HTLC
 * refund; for a deposit the PegIn spent, Redeem performs the expired-vault
 * redeem instead. Both are offered on exactly the terms the Vaults page's
 * inactive-vault row uses — both read `useRefundRowAction` and
 * `useClaimExpiredRowAction`, so the two cannot drift. Must be rendered inside
 * a PeginPollingProvider, which those hooks require.
 */

import { Hint } from "@babylonlabs-io/core-ui";

import {
  ERROR_ROW_BUTTON_CLASS,
  NEUTRAL_ROW_BUTTON_CLASS,
} from "@/components/shared/buttonClasses";
import { COPY } from "@/copy";
import { useClaimExpiredRowAction } from "@/hooks/deposit/useClaimExpiredRowAction";
import { useRefundRowAction } from "@/hooks/deposit/useRefundRowAction";

interface ExpiredWithdrawButtonProps {
  /** Vault id of the expired deposit — the refund modal's lookup key. */
  vaultId: string;
  onWithdraw: (vaultId: string) => void;
  /** Opens the expired-vault redeem modal. */
  onRedeem: (vaultId: string) => void;
}

export function ExpiredWithdrawButton({
  vaultId,
  onWithdraw,
  onRedeem,
}: ExpiredWithdrawButtonProps) {
  const { available, blockedTooltip } = useRefundRowAction(vaultId);
  const redeemAvailable = useClaimExpiredRowAction(vaultId);

  if (redeemAvailable) {
    return (
      <button
        type="button"
        onClick={() => onRedeem(vaultId)}
        className={ERROR_ROW_BUTTON_CLASS}
      >
        {COPY.vaults.actions.redeem}
      </button>
    );
  }

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
