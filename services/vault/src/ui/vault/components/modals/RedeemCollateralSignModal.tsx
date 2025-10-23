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

interface RedeemCollateralSignModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (btcTxid: string, ethTxHash: string) => void;
  depositIds: string[];
  btcConnector?: unknown; // for future implementation
  btcAddress?: string;
  depositorEthAddress?: string;
}

// Helper to delay for UI feedback
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function RedeemCollateralSignModal({
  open,
  onClose,
  onSuccess,
}: RedeemCollateralSignModalProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setCurrentStep(1);
      setProcessing(false);
      setError(null);
    }
  }, [open]);

  // Execute collateral redeem flow when modal opens
  useEffect(() => {
    if (open && currentStep === 1 && !processing && !error) {
      executeRedeemFlow();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // TODO: Replace with wallet integration
  const executeRedeemFlow = async () => {
    setProcessing(true);
    try {
      // Step 1: Simulate proof of possession
      setCurrentStep(1);
      console.log(
        "[RedeemCollateralSignModal] Step 1: Creating proof of possession...",
      );
      await delay(2000);

      // Step 2: Simulate transaction submission
      setCurrentStep(2);
      console.log(
        "[RedeemCollateralSignModal] Step 2: Submitting redemption request to Vault Controller...",
      );
      await delay(2000);

      // Step 3: Simulate validation
      setCurrentStep(3);
      console.log(
        "[RedeemCollateralSignModal] Step 3: Validating transaction...",
      );
      await delay(2000);

      // Step 4: Complete
      setCurrentStep(4);
      console.log("[RedeemCollateralSignModal] Step 4: Complete!");
      await delay(1000);

      setProcessing(false);

      // Call success callback with mock transaction IDs
      const mockBtcTxid = `mock-btc-txid-${Date.now()}`;
      const mockEthTxHash = `0x${Math.random().toString(16).substr(2, 64)}`;
      console.log("[RedeemCollateralSignModal] Redemption successful:", {
        mockBtcTxid,
        mockEthTxHash,
      });

      onSuccess(mockBtcTxid, mockEthTxHash);
    } catch (err) {
      console.error("[RedeemCollateralSignModal] Redemption failed:", err);
      setError(err instanceof Error ? err.message : "Unknown error occurred");
      setProcessing(false);
    }
  };

  return (
    <ResponsiveDialog open={open} onClose={onClose}>
      <DialogHeader
        title="Redemption in Progress"
        onClose={onClose}
        className="text-accent-primary"
      />

      <DialogBody className="flex flex-col gap-4 px-4 pb-8 pt-4 text-accent-primary sm:px-6">
        <Text
          variant="body2"
          className="text-sm text-accent-secondary sm:text-base"
        >
          Please wait while we process your redemption
        </Text>

        <div className="flex flex-col items-start gap-4 py-4">
          <Step step={1} currentStep={currentStep}>
            Sign proof of possession
          </Step>
          <Step step={2} currentStep={currentStep}>
            Sign & broadcast redemption request to Vault Controller
          </Step>
          <Step step={3} currentStep={currentStep}>
            Validating
          </Step>
          <Step step={4} currentStep={currentStep}>
            Complete
          </Step>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-error/10 rounded-lg p-4">
            <Text variant="body2" className="text-error text-sm">
              Error: {error}
            </Text>
          </div>
        )}
      </DialogBody>

      <DialogFooter className="px-4 pb-6 sm:px-6">
        <Button
          disabled={processing && !error}
          variant="contained"
          className="w-full text-xs sm:text-base"
          onClick={error ? onClose : () => { }}
        >
          {processing && !error ? (
            <Loader size={16} className="text-accent-contrast" />
          ) : error ? (
            "Close"
          ) : (
            "Done"
          )}
        </Button>
      </DialogFooter>
    </ResponsiveDialog>
  );
}
