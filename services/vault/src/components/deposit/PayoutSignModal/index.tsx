/**
 * PayoutSignModal
 *
 * Standalone modal for signing payout transactions.
 * Opens when user clicks "Sign" button from deposits table.
 *
 * This is Step 3 isolated - assumes Steps 1 & 2 already completed.
 */

import {
  Button,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Loader,
  ResponsiveDialog,
  Text,
} from "@babylonlabs-io/core-ui";
import type { Hex } from "viem";

import type { VaultActivity } from "../../../types/activity";

import { SigningProgress } from "./SigningProgress";
import { usePayoutSigningState } from "./usePayoutSigningState";

interface PayoutSignModalProps {
  /** Modal open state */
  open: boolean;
  /** Close handler */
  onClose: () => void;
  /** The deposit/activity to sign payouts for */
  activity: VaultActivity;
  /** Claim and payout transactions from polling */
  transactions: any[] | null;
  /** Depositor's BTC public key (x-only, 32 bytes without 0x prefix) */
  btcPublicKey: string;
  /** Depositor's ETH address */
  depositorEthAddress: Hex;
  /** Success callback - refetch activities */
  onSuccess: () => void;
}

/**
 * Modal for signing payout transactions (Step 3 only)
 *
 * Assumes proof of possession and ETH submission already complete.
 * Only handles payout signature signing and submission.
 */
export function PayoutSignModal({
  open,
  onClose,
  activity,
  transactions,
  btcPublicKey,
  depositorEthAddress,
  onSuccess,
}: PayoutSignModalProps) {
  const { signing, progress, error, handleSign } = usePayoutSigningState({
    activity,
    transactions,
    btcPublicKey,
    depositorEthAddress,
    onSuccess,
    onClose,
  });

  return (
    <ResponsiveDialog open={open} onClose={onClose}>
      <DialogHeader
        title="Sign Payout Transactions"
        onClose={onClose}
        className="text-accent-primary"
      />

      <DialogBody className="flex flex-col gap-4 px-4 pb-8 pt-4 text-accent-primary sm:px-6">
        <Text
          variant="body2"
          className="text-sm text-accent-secondary sm:text-base"
        >
          Your vault provider has prepared {transactions?.length ?? 0} payout{" "}
          {transactions?.length === 1 ? "transaction" : "transactions"}. Please
          sign to complete your deposit.
        </Text>

        {signing && <SigningProgress {...progress} />}

        {error && (
          <div className="bg-error/10 rounded-lg p-4">
            <Text variant="body1" className="text-error mb-1 font-medium">
              {error.title}
            </Text>
            <Text variant="body2" className="text-error text-sm">
              {error.message}
            </Text>
          </div>
        )}
      </DialogBody>

      <DialogFooter className="px-4 pb-6 sm:px-6">
        <Button
          disabled={signing}
          variant="contained"
          className="w-full text-xs sm:text-base"
          onClick={signing ? undefined : handleSign}
        >
          {signing ? (
            <Loader size={16} className="text-accent-contrast" />
          ) : error ? (
            "Retry"
          ) : (
            "Sign Payout Transactions"
          )}
        </Button>
      </DialogFooter>
    </ResponsiveDialog>
  );
}
