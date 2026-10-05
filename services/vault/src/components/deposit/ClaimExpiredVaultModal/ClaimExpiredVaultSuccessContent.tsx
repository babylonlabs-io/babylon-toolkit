import { Button, Heading, Text } from "@babylonlabs-io/core-ui";

import { COPY } from "@/copy";

interface ClaimExpiredVaultSuccessContentProps {
  onDone: () => void;
}

/**
 * Terminal success content: the redeem confirmed, the BTCVault is Redeemed,
 * and the vault provider will claim the BTC and pay it to the depositor's
 * committed payout address.
 */
export function ClaimExpiredVaultSuccessContent({
  onDone,
}: ClaimExpiredVaultSuccessContentProps) {
  const copy = COPY.deposit.claimExpired.success;
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
            {copy.heading}
          </Heading>
          <Text variant="body1" className="text-accent-secondary">
            {copy.body}
          </Text>
        </div>
      </div>
      <Button
        variant="contained"
        color="secondary"
        className="w-full"
        onClick={onDone}
      >
        {copy.doneButton}
      </Button>
    </div>
  );
}
