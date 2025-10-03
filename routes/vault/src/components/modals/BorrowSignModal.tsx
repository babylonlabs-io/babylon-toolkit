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

interface BorrowSignModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  borrowAmount?: number;
  collateralAmount?: string;
}

/**
 * BorrowSignModal - Multi-step signing modal for borrow flow
 * 
 * Shows 3 steps that auto-progress with 2-second delays:
 * 1. Mint vaultBTC
 * 2. Borrow Transaction
 * 3. Confirming on Ethereum
 * 
 * After all steps complete, triggers onSuccess callback to show success modal.
 * 
 * Note: This is hardcoded for UI demonstration only.
 * Real implementation would integrate with wallet signing.
 */
export function BorrowSignModal({
  open,
  onClose,
  onSuccess,
}: BorrowSignModalProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [processing, setProcessing] = useState(false);

  // Auto-progress through steps with 2-second delays (hardcoded for UI demo)
  useEffect(() => {
    if (!open || currentStep > 3) return;

    setProcessing(true);

    const timer = setTimeout(() => {
      if (currentStep === 3) {
        // Last step complete, trigger success modal
        setProcessing(false);
        onSuccess();
      } else {
        // Move to next step
        setCurrentStep((prev) => prev + 1);
      }
    }, 2000); // 2 second delay per step

    return () => clearTimeout(timer);
  }, [open, currentStep, onSuccess]);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setCurrentStep(1);
      setProcessing(false);
    }
  }, [open]);

  const handleSign = () => {
    // In real implementation, this would trigger wallet signing
    // For now, auto-progression handles everything
    setProcessing(true);
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
          Follow the steps below. Your wallet will prompt you when action is needed.
        </Text>

        <div className="flex flex-col items-start gap-4 py-4">
          <Step step={1} currentStep={currentStep}>
            Mint vaultBTC
          </Step>
          <Step step={2} currentStep={currentStep}>
            Borrow Transaction
          </Step>
          <Step step={3} currentStep={currentStep}>
            Confirming on Ethereum
          </Step>
        </div>
      </DialogBody>

      <DialogFooter className="flex gap-4">
        <Button
          variant="outlined"
          color="primary"
          onClick={onClose}
          className="flex-1 text-xs sm:text-base"
        >
          Cancel
        </Button>

        <Button
          disabled={processing || currentStep > 3}
          variant="contained"
          className="flex-1 text-xs sm:text-base"
          onClick={handleSign}
        >
          {processing ? (
            <Loader size={16} className="text-accent-contrast" />
          ) : (
            "Sign"
          )}
        </Button>
      </DialogFooter>
    </ResponsiveDialog>
  );
}

