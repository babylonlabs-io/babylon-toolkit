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
import { useEffect, useState } from "react";
import type { Hex } from "viem";
import { useMintAndBorrow } from "./useMintAndBorrow";

interface BorrowSignModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  borrowAmount?: number;
  collateralAmount?: string;
  /** Pegin transaction hash (vault ID) */
  pegInTxHash?: Hex;
}

/**
 * BorrowSignModal - Transaction signing modal for borrow flow
 *
 * The mintAndBorrow transaction atomically:
 * 1. Mints vaultBTC from the pegin
 * 2. Deposits vaultBTC as collateral to Morpho
 * 3. Borrows USDC against the collateral
 *
 * All three steps happen in a single Ethereum transaction.
 */
export function BorrowSignModal({
  open,
  onClose,
  onSuccess,
  borrowAmount,
  pegInTxHash,
}: BorrowSignModalProps) {
  const [transactionStarted, setTransactionStarted] = useState(false);
  const { executeMintAndBorrow, isLoading, error } = useMintAndBorrow();

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setTransactionStarted(false);
    }
  }, [open]);

  const handleSign = async () => {
    if (!pegInTxHash || !borrowAmount) {
      return;
    }

    // Convert USDC amount to bigint with 6 decimals
    const borrowAmountBigInt = BigInt(Math.floor(borrowAmount * 1_000_000));

    setTransactionStarted(true);

    try {
      const result = await executeMintAndBorrow({
        pegInTxHash,
        borrowAmount: borrowAmountBigInt,
      });

      if (result) {
        // Success - trigger success modal
        onSuccess();
      }
    } catch (error) {
      setTransactionStarted(false);
      // Keep modal open to show error
    }
  };

  return (
    <ResponsiveDialog open={open} onClose={onClose}>
      <DialogHeader
        title="Borrowing in Progress"
        onClose={onClose}
        className="text-accent-primary"
      />

      <DialogBody className="flex flex-col gap-4 px-4 pb-8 pt-4 text-accent-primary sm:px-6">
        <Text variant="body1" className="text-sm text-accent-secondary sm:text-base">
          Sign the transaction in your wallet to mint vaultBTC and borrow USDC atomically.
        </Text>

        <div className="flex flex-col items-start gap-4 py-4">
          <Step step={1} currentStep={transactionStarted || isLoading ? 1 : 0}>
            Mint vaultBTC & Borrow USDC
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
          disabled={isLoading || !pegInTxHash || !borrowAmount}
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

