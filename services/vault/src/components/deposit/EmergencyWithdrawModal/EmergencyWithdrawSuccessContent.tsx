import { Button, Heading, Text } from "@babylonlabs-io/core-ui";

import { COPY } from "@/copy";

interface EmergencyWithdrawSuccessContentProps {
  onDone: () => void;
}

/**
 * Terminal success content: the reveal-and-redeem transaction landed, the
 * BTC Vault is redeemed, and the vault provider will pay the BTC out to the
 * depositor's committed payout address.
 */
export function EmergencyWithdrawSuccessContent({
  onDone,
}: EmergencyWithdrawSuccessContentProps) {
  return (
    <div className="mx-auto flex w-full max-w-[564px] flex-col gap-10 rounded-3xl border border-secondary-strokeLight bg-surface px-6 pb-6 pt-10 dark:border-secondary-strokeDark">
      <div className="flex flex-col items-center gap-6">
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
        <div className="flex w-full flex-col items-center gap-4 text-center">
          <Heading variant="h5" className="text-accent-primary">
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
