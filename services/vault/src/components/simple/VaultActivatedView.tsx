/**
 * VaultActivatedView
 *
 * Terminal success screen shown in place of the deposit progress once every
 * BTC Vault in the deposit is active. Rendered as the sole content of the
 * deposit dialog (not a nested modal) so only one surface is ever visible.
 */

import { Button, Heading, Text } from "@babylonlabs-io/core-ui";

import { COPY } from "@/copy";

import { DEPOSIT_VIEW_MAX_WIDTH_CLASS } from "./DepositProgressView/layout";

interface VaultActivatedViewProps {
  onGoToDashboard: () => void;
}

export function VaultActivatedView({
  onGoToDashboard,
}: VaultActivatedViewProps) {
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
            {COPY.deposit.vaultActivatedSuccess.heading}
          </Heading>
          <Text variant="body1" className="text-accent-secondary">
            {COPY.deposit.vaultActivatedSuccess.body}
          </Text>
        </div>
      </div>
      <Button
        variant="contained"
        color="secondary"
        className="w-full"
        onClick={onGoToDashboard}
      >
        {COPY.deposit.vaultActivatedSuccess.goToDashboard}
      </Button>
    </div>
  );
}
