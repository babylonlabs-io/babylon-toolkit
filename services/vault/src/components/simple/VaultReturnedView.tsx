/**
 * VaultReturnedView
 *
 * Terminal screen shown in place of VaultActivatedView when an activation
 * landed but the registry redeemed a BTCVault for the depositor instead of
 * adding it to the position. Same layout as the activated screen, so the
 * deposit dialog still ends on one surface, with an info mark rather than a
 * check: the deposit did not end the way the depositor asked.
 *
 * `full` says the BTC is being returned, when every BTCVault of the deposit
 * was; `partial` says only part of the deposit is, when only some were, and
 * says nothing about what became of the others.
 */

import { Button, Heading, Text } from "@babylonlabs-io/core-ui";

import { COPY } from "@/copy";

import { DEPOSIT_VIEW_MAX_WIDTH_CLASS } from "./DepositProgressView/layout";

interface VaultReturnedViewProps {
  variant: "full" | "partial";
  onGoToDashboard: () => void;
}

export function VaultReturnedView({
  variant,
  onGoToDashboard,
}: VaultReturnedViewProps) {
  const copy = COPY.deposit.vaultReturnedSuccess[variant];
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
          <path d="M46 40V66" stroke="currentColor" strokeWidth="2" />
          <circle cx="46" cy="29" r="2" fill="currentColor" />
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
        onClick={onGoToDashboard}
      >
        {COPY.deposit.vaultReturnedSuccess.goToDashboard}
      </Button>
    </div>
  );
}
