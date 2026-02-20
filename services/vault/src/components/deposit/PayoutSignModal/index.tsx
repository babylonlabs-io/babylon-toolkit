/**
 * PayoutSignModal
 *
 * Modal for resuming the deposit flow at the payout signing step.
 * Shows the same stepper UI as the initial deposit modal, with
 * steps 1-2 already completed and step 3 (Sign Payouts) active.
 *
 * Auto-triggers wallet signing when the modal opens.
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

import { useOnModalOpen } from "@/hooks/useOnModalOpen";

import { DepositStep } from "../DepositSignModal/constants";
import { DepositSteps } from "../DepositSignModal/DepositSteps";
import { StatusBanner } from "../DepositSignModal/StatusBanner";
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
 * Get the step description text for the payout signing flow
 */
function getPayoutStepDescription(
  signing: boolean,
  isComplete: boolean,
  error: { title: string; message: string } | null,
  transactionCount: number,
): string {
  if (isComplete) {
    return "Payout transactions signed successfully!";
  }
  if (error) {
    return error.message;
  }
  if (signing) {
    return "Please sign the payout transaction(s) in your BTC wallet.";
  }
  return `Your vault provider has prepared ${transactionCount} payout transaction(s). Signing will begin automatically.`;
}

export function PayoutSignModal({
  open,
  onClose,
  activity,
  transactions,
  btcPublicKey,
  depositorEthAddress,
  onSuccess,
}: PayoutSignModalProps) {
  const { signing, progress, error, isComplete, handleSign } =
    usePayoutSigningState({
      activity,
      transactions,
      btcPublicKey,
      depositorEthAddress,
      onSuccess,
      onClose,
    });

  // Auto-trigger signing when modal opens
  useOnModalOpen(open, handleSign);

  const isProcessing = signing && !error && !isComplete;
  const canClose = !!error || isComplete || !signing;

  return (
    <ResponsiveDialog open={open} onClose={canClose ? onClose : undefined}>
      <DialogHeader
        title="Deposit Progress"
        onClose={canClose ? onClose : undefined}
        className="text-accent-primary"
      />

      <DialogBody className="flex flex-col gap-4 px-4 pb-8 pt-4 text-accent-primary sm:px-6">
        <Text
          variant="body2"
          className="text-sm text-accent-secondary sm:text-base"
        >
          {getPayoutStepDescription(
            signing,
            isComplete,
            error,
            transactions?.length ?? 0,
          )}
        </Text>

        {/* Stepper: steps 1-2 completed, currently on step 3 */}
        <DepositSteps
          currentStep={isComplete ? DepositStep.COMPLETED : DepositStep.SIGN_PAYOUTS}
        />

        {/* Signing progress bar */}
        {signing && (
          <SigningProgress
            step={DepositStep.SIGN_PAYOUTS}
            isWaiting={false}
            {...progress}
          />
        )}

        {error && <StatusBanner variant="error">{error.message}</StatusBanner>}

        {isComplete && (
          <StatusBanner variant="success">
            Your payout transactions have been signed and submitted
            successfully. Your deposit is now being processed.
          </StatusBanner>
        )}
      </DialogBody>

      <DialogFooter className="px-4 pb-6 sm:px-6">
        <Button
          disabled={!canClose}
          variant="contained"
          className="w-full text-xs sm:text-base"
          onClick={error ? handleSign : onClose}
        >
          {error ? (
            "Retry"
          ) : isComplete ? (
            "Done"
          ) : isProcessing ? (
            <Loader size={16} className="text-accent-contrast" />
          ) : (
            "Close"
          )}
        </Button>
      </DialogFooter>
    </ResponsiveDialog>
  );
}
