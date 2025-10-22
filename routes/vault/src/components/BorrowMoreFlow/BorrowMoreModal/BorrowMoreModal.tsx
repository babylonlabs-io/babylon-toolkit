import {
  Button,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Loader,
  ResponsiveDialog,
  Text,
  SubSection,
  AmountItem,
} from "@babylonlabs-io/core-ui";
import { useState, useEffect } from "react";
import { useBorrowMoreTransaction } from "./useBorrowMoreTransaction";
import { usdcIcon } from "../../../assets";

interface BorrowMoreModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  marketId?: string;
  borrowedSymbol?: string;
  currentLTV?: number;
  liquidationLTV?: number;
}

/**
 * BorrowMoreModal - Transaction modal for borrowing more from existing position
 *
 * Allows user to input an amount and borrow more funds from their position
 * without adding collateral.
 */
export function BorrowMoreModal({
  open,
  onClose,
  onSuccess,
  marketId,
  borrowedSymbol = "USDC",
  currentLTV = 0,
  liquidationLTV = 0,
}: BorrowMoreModalProps) {
  const [borrowAmount, setBorrowAmount] = useState("");

  const borrowAmountWei = borrowAmount
    ? BigInt(Math.floor(parseFloat(borrowAmount) * 1e6)) // Assuming 6 decimals for USDC
    : 0n;

  const {
    isLoading,
    error,
    executeTransaction,
  } = useBorrowMoreTransaction({
    marketId,
    borrowAmount: borrowAmountWei,
    isOpen: open,
  });

  // Reset amount when modal opens
  useEffect(() => {
    if (open) {
      setBorrowAmount("");
    }
  }, [open]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setBorrowAmount(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
    }
  };

  const handleBorrow = async () => {
    try {
      await executeTransaction();
      onSuccess();
    } catch (err) {
      // Error is already shown in the modal
      console.error('Borrow more transaction failed:', err);
    }
  };

  // Check if we're ready to execute (have all required data)
  const isReady = !!marketId && borrowAmountWei > 0n;

  return (
    <ResponsiveDialog open={open} onClose={onClose}>
      <DialogHeader
        title="Borrow More"
        onClose={onClose}
        className="text-accent-primary"
      />

      <DialogBody className="text-accent-primary flex flex-col gap-4 px-4 pb-8 pt-4 sm:px-6">
        <Text variant="body1" className="text-accent-secondary text-sm sm:text-base">
          Borrow additional funds from your existing position. Make sure your position
          maintains a healthy LTV ratio to avoid liquidation.
        </Text>

        {/* Current LTV info */}
        {currentLTV > 0 && (
          <div className="bg-secondary-highlight rounded p-3 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-accent-secondary">Current LTV</span>
              <span className="font-medium">{currentLTV}%</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-accent-secondary">Liquidation LTV</span>
              <span className="font-medium">{liquidationLTV}%</span>
            </div>
          </div>
        )}

        {/* Borrow Amount Input */}
        <SubSection className="flex w-full flex-col content-center justify-between gap-4">
          <AmountItem
            amount={borrowAmount}
            currencyIcon={usdcIcon}
            currencyName={borrowedSymbol}
            placeholder="0"
            displayBalance={false}
            min="0"
            step="any"
            autoFocus={true}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            amountUsd={borrowAmount ? `$${(parseFloat(borrowAmount) * 1.0).toFixed(2)}` : "$0.00"}
            subtitle={`Enter amount to borrow in ${borrowedSymbol}`}
          />
        </SubSection>

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
          disabled={isLoading || !isReady}
          variant="contained"
          className="flex-1 text-xs sm:text-base"
          onClick={handleBorrow}
        >
          {isLoading ? (
            <Loader size={16} className="text-accent-contrast" />
          ) : !isReady ? (
            "Enter Amount"
          ) : (
            "Borrow"
          )}
        </Button>
      </DialogFooter>
    </ResponsiveDialog>
  );
}
