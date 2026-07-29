/**
 * EmergencyWithdrawSubmittedView
 *
 * Terminal success screen for the activate-and-redeem escape hatch: the
 * reveal-and-redeem transaction landed, the BTC Vault is redeemed, and the
 * vault provider will pay the BTC out to the depositor's payout address.
 * Rendered as the sole content of the deposit dialog (not a nested modal),
 * owned by PostDepositContinuationView so a polling re-selection cannot swap
 * it for the activation success screen.
 */

import { Button, Heading, Text } from "@babylonlabs-io/core-ui";

import { COPY } from "@/copy";

import { DEPOSIT_VIEW_MAX_WIDTH_CLASS } from "./DepositProgressView/layout";

interface EmergencyWithdrawSubmittedViewProps {
  onDone: () => void;
}

export function EmergencyWithdrawSubmittedView({
  onDone,
}: EmergencyWithdrawSubmittedViewProps) {
  return (
    <div
      className={`w-full ${DEPOSIT_VIEW_MAX_WIDTH_CLASS} overflow-hidden rounded-2xl border border-secondary-strokeLight bg-primary-contrast px-6 pb-6 pt-10`}
    >
      <div className="flex flex-col items-center gap-10 pb-10 text-center">
        <svg
          width="92"
          height="92"
          viewBox="0 0 92 92"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="text-black dark:text-white"
          aria-hidden="true"
        >
          <path
            d="M23.5 48.6417L40.3755 65.1235L73 32.4995"
            stroke="currentColor"
            strokeWidth="2"
          />
          <circle
            cx="46"
            cy="46"
            r="45"
            stroke="currentColor"
            strokeWidth="2"
          />
        </svg>
        <div className="flex flex-col items-center gap-4">
          <Heading variant="h4" className="text-black dark:text-white">
            {COPY.deposit.emergencyWithdraw.success.heading}
          </Heading>
          <Text variant="body1" className="text-accent-secondary">
            {COPY.deposit.emergencyWithdraw.success.body}
          </Text>
        </div>
      </div>
      <Button
        variant="contained"
        color="secondary"
        className="w-full"
        onClick={onDone}
      >
        {COPY.deposit.emergencyWithdraw.success.doneButton}
      </Button>
    </div>
  );
}
