import { getETHChain } from "@babylonlabs-io/config";
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
import { getSharedWagmiConfig } from "@babylonlabs-io/wallet-connector";
import { useCallback, useEffect, useState } from "react";
import type { Hex, WalletClient } from "viem";
import { getWalletClient } from "wagmi/actions";

import { CONTRACTS } from "../../../../config";
import { redeemVaults } from "../../../../services/vault/vaultTransactionService";
import type { VaultActivity } from "../../../../types/activity";

interface RedeemCollateralSignModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (ethTxHash: string) => void;
  activities: VaultActivity[];
  depositIds: string[];
}

export function RedeemCollateralSignModal({
  open,
  onClose,
  onSuccess,
  activities,
  depositIds,
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

  const executeRedeemFlow = useCallback(async () => {
    setProcessing(true);
    setError(null);

    try {
      // Step 1: Get wallet client
      setCurrentStep(1);
      const ethChain = getETHChain();
      const ethWalletClient = await getWalletClient(getSharedWagmiConfig(), {
        chainId: ethChain.id,
      });

      if (!ethWalletClient) {
        throw new Error("Ethereum wallet not connected");
      }

      // Step 2: Get peg-in transaction hashes from activities
      setCurrentStep(2);
      const pegInTxHashes = activities
        .filter((a) => depositIds.includes(a.id))
        .map((a) => (a.txHash || a.id) as Hex)
        .filter((hash): hash is Hex => !!hash);

      if (pegInTxHashes.length === 0) {
        throw new Error("No valid transaction hashes found for redemption");
      }

      // Step 3: Execute redemption transactions
      setCurrentStep(3);
      const results = await redeemVaults(
        ethWalletClient as WalletClient,
        ethChain,
        CONTRACTS.VAULT_CONTROLLER,
        pegInTxHashes,
      );

      // Step 4: Complete
      setCurrentStep(4);
      setProcessing(false);

      // Get the first transaction hash for success callback
      const firstTxHash = results[0]?.transactionHash || "";

      onSuccess(firstTxHash);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error occurred");
      setProcessing(false);
    }
  }, [activities, depositIds, onSuccess]);

  return (
    <ResponsiveDialog open={open} onClose={!processing ? onClose : undefined}>
      <DialogHeader
        title="Sign Transaction"
        onClose={!processing ? onClose : undefined}
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
            Connecting wallet
          </Step>
          <Step step={2} currentStep={currentStep}>
            Preparing transactions ({depositIds.length} deposits)
          </Step>
          <Step step={3} currentStep={currentStep}>
            Executing redemptions
          </Step>
          <Step step={4} currentStep={currentStep}>
            Complete
          </Step>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-error/10 rounded-lg p-4">
            <Text variant="body2" className="text-error text-sm">
              {error}
            </Text>
          </div>
        )}
      </DialogBody>

      <DialogFooter className="px-4 pb-6 sm:px-6">
        <Button
          disabled={processing && !error}
          variant="contained"
          className="w-full text-xs sm:text-base"
          onClick={error ? onClose : () => {}}
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
