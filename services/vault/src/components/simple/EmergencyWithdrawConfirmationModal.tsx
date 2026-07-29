import {
  Button,
  Checkbox,
  DialogBody,
  DialogFooter,
  ResponsiveDialog,
} from "@babylonlabs-io/core-ui";
import { useEffect, useState } from "react";

import { isActivateAndRedeemBlocked } from "@/components/shared/protocolStatus";
import { COPY } from "@/copy";
import { useProtocolGateState } from "@/hooks/useProtocolGate";

interface EmergencyWithdrawConfirmationModalProps {
  open: boolean;
  /**
   * True when the stuck state was detected on-chain (HTLC spent while the
   * vault is still Verified): the body explains what happened instead of
   * warning that waiting for expiry + refund is the safe default.
   */
  stuckStateDetected: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

/**
 * Confirmation gate for the activate-and-redeem escape hatch. Revealing the
 * secret is irreversible, so the confirm button stays disabled until the
 * user explicitly acknowledges that — and while the protocol scope is paused
 * (the one governance state that blocks this exit; an aave-scope pause does
 * not, see `isActivateAndRedeemBlocked`).
 */
export function EmergencyWithdrawConfirmationModal({
  open,
  stuckStateDetected,
  onClose,
  onConfirm,
}: EmergencyWithdrawConfirmationModalProps) {
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAcknowledged(false);
  }, [open]);

  const gate = useProtocolGateState();
  const canWithdraw = acknowledged && !isActivateAndRedeemBlocked(gate);

  return (
    <ResponsiveDialog
      open={open}
      onClose={onClose}
      className="w-[564px] max-w-full"
      dialogClassName="!rounded-2xl"
    >
      {/* No header: this inner-flow dialog offers no X — dismissal goes
          through the footer actions (Escape/backdrop still route through
          onClose via ResponsiveDialog). The top padding stands in for the
          removed header row. */}
      <DialogBody className="flex flex-col items-stretch gap-10 px-6 pb-2 pt-10 text-accent-primary">
        <div className="flex flex-col items-center gap-10">
          <svg
            width="90"
            height="90"
            viewBox="0 0 90 90"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="text-accent-primary"
            aria-hidden="true"
          >
            <path
              d="M11.25 15.4793L45.0161 5.625L78.75 15.4793V35.6882C78.75 56.9291 65.1566 75.7864 45.0049 82.5009C24.8477 75.7866 11.25 56.925 11.25 35.6788V15.4793Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
          <div className="flex w-full flex-col items-center gap-4">
            <h2 className="text-center text-[34px] font-normal leading-[1.235] tracking-[0.25px] text-accent-primary">
              {COPY.deposit.emergencyWithdraw.title}
            </h2>
            <p className="text-center text-xl font-normal leading-[1.6] tracking-[0.15px] text-accent-secondary">
              {stuckStateDetected
                ? COPY.deposit.emergencyWithdraw.bodyStuck
                : COPY.deposit.emergencyWithdraw.bodyAdvanced}
            </p>
          </div>
        </div>

        <label className="flex w-full cursor-pointer items-start gap-4">
          <Checkbox
            checked={acknowledged}
            onChange={() => setAcknowledged((v) => !v)}
            variant="default"
            showLabel={false}
          />
          <span className="text-base leading-[1.5] tracking-[0.15px] text-accent-primary">
            {COPY.deposit.emergencyWithdraw.riskAcknowledgement}
          </span>
        </label>
      </DialogBody>

      {/* size="medium" gives the design's 14px label and 16px side padding;
          h-10 restores the design's 40px height over medium's default. */}
      <DialogFooter className="flex flex-row gap-4 px-6 pb-6 pt-4">
        <Button
          variant="outlined"
          size="medium"
          className="h-10 flex-1"
          onClick={onClose}
        >
          {COPY.deposit.emergencyWithdraw.cancelButton}
        </Button>
        <Button
          variant="contained"
          color="secondary"
          size="medium"
          className="h-10 flex-1"
          onClick={onConfirm}
          disabled={!canWithdraw}
          data-testid="emergency-withdraw-button"
        >
          {COPY.deposit.emergencyWithdraw.confirmButton}
        </Button>
      </DialogFooter>
    </ResponsiveDialog>
  );
}
