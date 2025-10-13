import type { Hex } from "viem";
import {
  Button,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Loader,
  ResponsiveDialog,
  Step,
  Text,
} from "@babylonlabs-io/core-ui";
import { useRepayTransaction } from "./useRepayTransaction";

interface RepaySignModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  pegInTxHash?: Hex;
  /** Total amount to repay in USDC wei (6 decimals) */
  repayAmountWei?: bigint;
}

/**
 * RepaySignModal - Transaction signing modal for repay flow
 *
 * The repayAndPegout transaction:
 * 1. Repays the USDC loan to Morpho
 * 2. Withdraws vaultBTC collateral from Morpho
 * 3. Burns vaultBTC and initiates pegout to release BTC
 */
export function RepaySignModal({
  open,
  onClose,
  onSuccess,
  pegInTxHash,
  repayAmountWei,
}: RepaySignModalProps) {
  const {
    currentStep,
    isLoading,
    error,
    executeTransaction,
  } = useRepayTransaction({
    pegInTxHash,
    repayAmountWei,
    isOpen: open,
  });

  const handleSign = async () => {
    try {
      await executeTransaction();
      onSuccess();
    } catch {
      // Error is already handled in the hook
    }
  };

  return (
    <ResponsiveDialog open={open} onClose={onClose}>
      <DialogHeader
        title="Repaying in Progress"
        onClose={onClose}
        className="text-accent-primary"
      />

      <DialogBody className="flex flex-col gap-4 px-4 pb-8 pt-4 text-accent-primary sm:px-6">
        <Text variant="body1" className="text-sm text-accent-secondary sm:text-base">
          Sign the transaction to repay your full loan balance (including interest) and withdraw your BTC.
        </Text>

        <div className="flex flex-col items-start gap-4 py-4">
          <Step step={1} currentStep={currentStep}>
            Approve Loan Token Spending
          </Step>
          <Step step={2} currentStep={currentStep}>
            Repay Full Loan & Withdraw BTC
          </Step>
        </div>

        {error && (
          <Text variant="body2" className="text-error-main text-sm">
            {error}
          </Text>
        )}
      </DialogBody>

      <DialogFooter className="flex gap-4">
        <Button
          variant="outlined"
          color="primary"
          onClick={onClose}
          className="flex-1 text-xs sm:text-base"
          disabled={isLoading}
        >
          Cancel
        </Button>

        <Button
          disabled={isLoading || !pegInTxHash || !repayAmountWei}
          variant="contained"
          className="flex-1 text-xs sm:text-base"
          onClick={handleSign}
        >
          {isLoading ? (
            <Loader size={16} className="text-accent-contrast" />
          ) : (
            "Sign"
          )}
        </Button>
      </DialogFooter>
    </ResponsiveDialog>
  );
}
