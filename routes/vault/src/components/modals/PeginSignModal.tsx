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

interface PeginSignModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  amount: number;
  selectedProviders: string[];
}

/**
 * PeginSignModal - Multi-step signing modal for deposit flow
 * 
 * Shows 4 steps that auto-progress with 2-second delays:
 * 1. Sign proof of possession
 * 2. Sign & broadcast pegInRequest to Vault Controller
 * 3. Validating
 * 4. Payout transactions
 * 
 * After all steps complete, triggers onSuccess callback to show success modal.
 * 
 * Note: This is hardcoded for UI demonstration only.
 * Real implementation would integrate with wallet signing.
 */
export function PeginSignModal({
  open,
  onClose,
  onSuccess,
}: PeginSignModalProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [processing, setProcessing] = useState(false);

  // Auto-progress through steps with 2-second delays (hardcoded for UI demo)
  useEffect(() => {
    if (!open || currentStep > 4) return;

    setProcessing(true);

    const timer = setTimeout(() => {
      if (currentStep === 4) {
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

  return (
    <ResponsiveDialog open={open} onClose={onClose}>
      <DialogHeader
        title="Deposit in Progress"
        onClose={onClose}
        className="text-accent-primary"
      />

      <DialogBody className="flex flex-col gap-4 px-4 pb-8 pt-4 text-accent-primary sm:px-6">
        <Text variant="body2" className="text-sm text-accent-secondary sm:text-base">
          Please sign the following messages
        </Text>

        <div className="flex flex-col items-start gap-4 py-4">
          <Step step={1} currentStep={currentStep}>
            Step 1: Sign proof of possession
          </Step>
          <Step step={2} currentStep={currentStep}>
            Step 2: Sign & broadcast pegInRequest to Vault Controller
          </Step>
          <Step step={3} currentStep={currentStep}>
            Step 3: Validating
          </Step>
          <Step step={4} currentStep={currentStep}>
            Step 4: Payout transactions
          </Step>
        </div>
      </DialogBody>

      <DialogFooter className="px-4 pb-6 sm:px-6">
        <Button
          disabled={processing || currentStep > 4}
          variant="contained"
          className="w-full text-xs sm:text-base"
          onClick={() => {}}
        >
          {processing ? (
            <Loader size={16} className="text-accent-contrast" />
          ) : (
            "View Position"
          )}
        </Button>
      </DialogFooter>
    </ResponsiveDialog>
  );
}
