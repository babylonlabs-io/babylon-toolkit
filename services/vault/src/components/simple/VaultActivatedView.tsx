/**
 * VaultActivatedView
 *
 * Terminal success screen shown in place of the deposit progress once every
 * BTC Vault in the deposit is active. Rendered as the sole content of the
 * deposit dialog (not a nested modal) so only one surface is ever visible.
 */

import { Button, Heading, Text } from "@babylonlabs-io/core-ui";
import { IoCheckmarkSharp } from "react-icons/io5";

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
      className={`w-full ${DEPOSIT_VIEW_MAX_WIDTH_CLASS} overflow-hidden rounded-xl border border-secondary-strokeDark px-6 pb-6 pt-10`}
    >
      <div className="flex flex-col items-center gap-6 pb-10 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-accent-primary">
          <IoCheckmarkSharp size={40} className="text-accent-primary" />
        </div>
        <div className="flex flex-col items-center gap-2">
          <Heading variant="h5" className="text-accent-primary">
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
