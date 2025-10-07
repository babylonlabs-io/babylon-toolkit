import { useEffect, useState } from "react";
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

interface RepaySignModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  pegInTxHash?: Hex;
}

/**
 * RepaySignModal - Transaction signing modal for repay flow
 *
 * The repayAndPegout transaction:
 * 1. Repays the USDC loan to Morpho
 * 2. Withdraws vaultBTC collateral from Morpho
 * 3. Burns vaultBTC and initiates pegout to release BTC
 *
 */
export function RepaySignModal({
  open,
  onClose,
  onSuccess,
  pegInTxHash,
}: RepaySignModalProps) {
  const [transactionStarted, setTransactionStarted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setTransactionStarted(false);
      setIsLoading(false);
      setError(null);
    }
  }, [open]);

  // Show error in console if transaction fails
  useEffect(() => {
    if (error) {
      console.error('[RepaySignModal] Transaction error:', error);
    }
  }, [error]);

  const handleSign = async () => {
    if (!pegInTxHash) {
      console.error('[RepaySignModal] Missing pegInTxHash');
      return;
    }

    console.log('[RepaySignModal] Starting repay transaction:', { pegInTxHash });
    setTransactionStarted(true);
    setIsLoading(true);
    setError(null);

    try {
      // TODO: Implement actual repayAndPegout transaction
      // const result = await repayAndPegout(vaultControllerAddress, pegInTxHash);
      
      // Simulate transaction for now
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Success - trigger success modal
      onSuccess();
    } catch (err) {
      console.error('[RepaySignModal] Transaction failed:', err);
      setError(err instanceof Error ? err.message : 'Transaction failed');
      setTransactionStarted(false);
      setIsLoading(false);
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
          Sign the transaction in your wallet to repay your loan and withdraw your BTC.
        </Text>

        <div className="flex flex-col items-start gap-4 py-4">
          <Step step={1} currentStep={transactionStarted || isLoading ? 1 : 0}>
            Repay Loan & Withdraw BTC
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
          disabled={isLoading || !pegInTxHash}
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
