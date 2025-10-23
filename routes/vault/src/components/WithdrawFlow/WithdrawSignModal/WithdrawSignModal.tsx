/**
 * WithdrawSignModal - Modal for confirming and executing collateral withdrawal
 */

import { useState, useEffect } from 'react';
import {
  Dialog,
  MobileDialog,
  DialogHeader,
  DialogBody,
  DialogFooter,
  Button,
  Loader,
  useIsMobile,
} from '@babylonlabs-io/core-ui';
import { twMerge } from 'tailwind-merge';
import { useWithdrawTransaction } from './useWithdrawTransaction';

interface WithdrawSignModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  marketId?: string;
  collateralAmount?: string;
  collateralSymbol?: string;
}

export function WithdrawSignModal({
  open,
  onClose,
  onSuccess,
  marketId,
  collateralAmount,
  collateralSymbol,
}: WithdrawSignModalProps) {
  const isMobileView = useIsMobile(640);
  const DialogComponent = isMobileView ? MobileDialog : Dialog;

  const [hasStarted, setHasStarted] = useState(false);

  const { currentStep, isLoading, error, executeTransaction, reset } = useWithdrawTransaction({
    marketId,
    isOpen: open,
  });

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setHasStarted(false);
      reset();
    }
  }, [open, reset]);

  const handleSign = async () => {
    setHasStarted(true);
    try {
      await executeTransaction();
      onSuccess();
    } catch (error) {
      // Error is already set in the hook
    }
  };

  const steps = [
    { label: 'Withdraw Collateral', description: 'Confirm transaction in wallet' },
  ];

  const currentStepIndex = currentStep === 0 ? -1 : 0;

  return (
    <DialogComponent open={open} onClose={onClose} className="w-[41.25rem] max-w-full">
      <DialogHeader title="Withdraw Collateral" onClose={onClose} className="text-accent-primary" />
      <DialogBody className="no-scrollbar text-accent-primary mb-8 mt-4 flex max-h-[calc(100vh-12rem)] flex-col gap-6 overflow-y-auto px-4 sm:px-6">
        {/* Collateral Info */}
        <div className="bg-secondary-highlight rounded-lg p-4">
          <div className="flex justify-between">
            <span className="text-accent-secondary text-sm">Withdrawing</span>
            <span className="text-sm font-medium">
              {collateralAmount} {collateralSymbol}
            </span>
          </div>
        </div>

        {/* Transaction Steps */}
        <div className="space-y-4">
          {steps.map((step, index) => {
            const isActive = index === currentStepIndex;
            const isCompleted = index < currentStepIndex;

            return (
              <div
                key={index}
                className={twMerge(
                  'flex items-center gap-3 rounded-lg p-3',
                  isActive && 'bg-primary-light/10'
                )}
              >
                <div
                  className={twMerge(
                    'flex size-8 items-center justify-center rounded-full',
                    isCompleted && 'bg-success-main text-white',
                    isActive && 'bg-primary-main text-white',
                    !isActive && !isCompleted && 'bg-secondary-main text-accent-secondary'
                  )}
                >
                  {isActive && isLoading ? (
                    <Loader size={16} className="text-white" />
                  ) : isCompleted ? (
                    '✓'
                  ) : (
                    index + 1
                  )}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium">{step.label}</div>
                  <div className="text-accent-secondary text-xs">{step.description}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-error/10 border-error rounded-lg border p-4">
            <div className="text-error text-sm font-semibold mb-1">Transaction Failed</div>
            <div className="text-error text-xs">{error}</div>
          </div>
        )}

        {/* Info Message */}
        <div className="bg-secondary-highlight rounded-lg p-4">
          <div className="text-accent-secondary text-xs">
            This will withdraw ALL collateral from your position. Position must have no debt.
          </div>
        </div>
      </DialogBody>
      <DialogFooter className="flex flex-col gap-4 pb-8 pt-0">
        <Button
          variant="contained"
          color="primary"
          onClick={handleSign}
          className="w-full"
          disabled={isLoading || hasStarted}
        >
          {isLoading ? 'Processing...' : hasStarted ? 'Transaction Submitted' : 'Withdraw'}
        </Button>
      </DialogFooter>
    </DialogComponent>
  );
}
