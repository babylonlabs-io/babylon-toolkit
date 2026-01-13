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
import { useEffect, useRef } from "react";
import type { Address } from "viem";

import { useDepositFlow } from "@/hooks/deposit/useDepositFlow";

interface CollateralDepositSignModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (
    btcTxid: string,
    ethTxHash: string,
    depositorBtcPubkey: string,
  ) => void;
  amount: bigint; // in satoshis
  feeRate: number; // Fee rate from review modal (sat/vB)
  btcWalletProvider: any; // TODO: Type this properly with IBTCProvider
  depositorEthAddress: Address | undefined;
  selectedApplication: string;
  selectedProviders: string[];
  vaultProviderBtcPubkey: string; // Vault provider's BTC public key from API
  liquidatorBtcPubkeys: string[]; // Liquidators' BTC public keys from API
  onRefetchActivities?: () => Promise<void>; // Optional refetch function to refresh deposit data
}

function canCloseModal(currentStep: number, error: string | null): boolean {
  if (error) return true;
  if (currentStep === 5) return true; // Complete
  return false;
}

export function CollateralDepositSignModal({
  open,
  onClose,
  onSuccess,
  amount,
  feeRate,
  btcWalletProvider,
  depositorEthAddress,
  selectedApplication,
  selectedProviders,
  vaultProviderBtcPubkey,
  liquidatorBtcPubkeys,
  onRefetchActivities,
}: CollateralDepositSignModalProps) {
  // Track previous open state to detect transitions
  const prevOpenRef = useRef(false);
  const hasExecutedRef = useRef(false);

  const {
    executeDepositFlow,
    currentStep,
    processing,
    error,
    isWaiting,
    stepDescription,
  } = useDepositFlow({
    amount,
    feeRate,
    btcWalletProvider,
    depositorEthAddress,
    selectedApplication,
    selectedProviders,
    vaultProviderBtcPubkey,
    liquidatorBtcPubkeys,
    modalOpen: open, // Pass modal open state to control Step 3 auto-signing
    onSuccess: (
      btcTxid: string,
      ethTxHash: string,
      depositorBtcPubkey: string,
    ) => {
    // NOTE: localStorage was already updated in useDepositFlow after Step 2 (PENDING)
    // and after Step 3 (PAYOUT_SIGNED)

      // Trigger refetch to immediately show the updated deposit
      if (onRefetchActivities) {
        onRefetchActivities();
      }

      onSuccess(btcTxid, ethTxHash, depositorBtcPubkey);
    },
  });

  // Execute flow once when modal transitions from closed to open
  useEffect(() => {
    const justOpened = open && !prevOpenRef.current;
    if (justOpened && !hasExecutedRef.current) {
      // Mark as executed immediately to prevent duplicate calls (React 18 Strict Mode)
      hasExecutedRef.current = true;
      executeDepositFlow();
    }

    // Reset execution flag when modal closes
    if (!open && prevOpenRef.current) {
      hasExecutedRef.current = false;
    }

    // Update previous open state
    prevOpenRef.current = open;
    // executeDepositFlow is intentionally not in deps - we only want to execute on modal open transition
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const isComplete = currentStep === 5;
  const canClose = canCloseModal(currentStep, error);

  return (
    <ResponsiveDialog open={open} onClose={canClose ? onClose : undefined}>
      <DialogHeader
        title="Deposit in Progress"
        onClose={canClose ? onClose : undefined}
        className="text-accent-primary"
      />

      <DialogBody className="flex flex-col gap-4 px-4 pb-8 pt-4 text-accent-primary sm:px-6">
        <Text
          variant="body2"
          className="text-sm text-accent-secondary sm:text-base"
        >
          {stepDescription}
        </Text>

        {/* 4-Step Progress Indicator */}
        <div className="flex flex-col items-start gap-4 py-4">
          <Step step={1} currentStep={currentStep}>
            Sign proof of possession
          </Step>
          <Step step={2} currentStep={currentStep}>
            Sign & submit peg-in request to Ethereum
          </Step>
          <Step step={3} currentStep={currentStep}>
            Sign payout transactions
          </Step>
          <Step step={4} currentStep={currentStep}>
            Sign & broadcast Bitcoin transaction
          </Step>
        </div>

        {/* Error State */}
        {error && (
          <div className="rounded-lg bg-error-main/10 p-4">
            <Text variant="body2" className="text-sm text-error-main">
              {error}
            </Text>
          </div>
        )}

        {/* Success State */}
        {isComplete && (
          <div className="rounded-lg bg-success-main/10 p-4">
            <Text variant="body2" className="text-sm text-success-main">
              Your Bitcoin transaction has been broadcast to the network. It
              will be confirmed after receiving the required number of Bitcoin
              confirmations.
            </Text>
          </div>
        )}
      </DialogBody>

      <DialogFooter className="px-4 pb-6 sm:px-6">
        <Button
          disabled={(processing || isWaiting) && !error && !isComplete}
          variant="contained"
          className="w-full text-xs sm:text-base"
          onClick={canClose ? onClose : undefined}
        >
          {(processing || isWaiting) && !error && !isComplete ? (
            <Loader size={16} className="text-accent-contrast" />
          ) : error ? (
            "Close"
            ) : isComplete ? (
              "Done"
          ) : (
                  "Processing..."
          )}
        </Button>
      </DialogFooter>
    </ResponsiveDialog>
  );
}
