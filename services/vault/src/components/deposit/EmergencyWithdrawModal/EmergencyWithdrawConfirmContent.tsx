import {
  Button,
  Callout,
  Checkbox,
  Heading,
  Loader,
  Text,
} from "@babylonlabs-io/core-ui";
import { useState } from "react";

import { isActivateAndRedeemBlocked } from "@/components/shared/protocolStatus";
import { COPY } from "@/copy";
import { useProtocolGateState } from "@/hooks/useProtocolGate";

interface EmergencyWithdrawConfirmContentProps {
  /** True when the stuck state was detected on-chain — drives the body copy. */
  stuckStateDetected: boolean;
  /** Reveal + redeem in flight (wallet popup or on-chain submission). */
  withdrawing: boolean;
  error: string | null;
  /** Terminal failure (activation deadline passed) — confirm stays disabled. */
  errorTerminal: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmation content of the withdraw modal. Revealing the secret is
 * irreversible, so the confirm button stays disabled until the user
 * explicitly acknowledges that — and while the protocol scope is paused (the
 * one governance state that blocks this exit; an aave-scope pause does not,
 * see `isActivateAndRedeemBlocked`).
 */
export function EmergencyWithdrawConfirmContent({
  stuckStateDetected,
  withdrawing,
  error,
  errorTerminal,
  onConfirm,
  onCancel,
}: EmergencyWithdrawConfirmContentProps) {
  const [acknowledged, setAcknowledged] = useState(false);

  const gate = useProtocolGateState();
  const canWithdraw =
    acknowledged &&
    !withdrawing &&
    !errorTerminal &&
    !isActivateAndRedeemBlocked(gate);

  return (
    <div className="mx-auto flex w-full max-w-[564px] flex-col gap-10 rounded-3xl border border-secondary-strokeLight bg-surface px-6 pb-6 pt-10 dark:border-secondary-strokeDark">
      <div className="flex flex-col items-center gap-6">
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
        <div className="flex w-full flex-col items-center gap-4 text-center">
          <Heading variant="h5" className="text-accent-primary">
            {COPY.deposit.emergencyWithdraw.title}
          </Heading>
          <Text variant="body1" className="text-accent-secondary">
            {stuckStateDetected
              ? COPY.deposit.emergencyWithdraw.bodyStuck
              : COPY.deposit.emergencyWithdraw.bodyAdvanced}
          </Text>
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

      <div className="flex flex-col gap-4">
        {error && <Callout variant="error">{error}</Callout>}
        <div className="flex w-full gap-4">
          <Button
            variant="outlined"
            color="primary"
            className="flex-1 whitespace-nowrap !border-secondary-strokeLight"
            onClick={onCancel}
            disabled={withdrawing}
          >
            {COPY.deposit.emergencyWithdraw.cancelButton}
          </Button>
          <Button
            variant="contained"
            color="secondary"
            className="flex-1 whitespace-nowrap"
            onClick={onConfirm}
            disabled={!canWithdraw}
            data-testid="emergency-withdraw-button"
          >
            {withdrawing ? (
              <span className="flex items-center justify-center gap-2">
                <Loader size={16} className="text-accent-contrast" />
                <span>{COPY.common.confirming}</span>
              </span>
            ) : error && !errorTerminal ? (
              COPY.deposit.emergencyWithdraw.retryButton
            ) : (
              COPY.deposit.emergencyWithdraw.confirmButton
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
