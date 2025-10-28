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
import { useEffect } from "react";
import type { Address } from "viem";

import { useDepositFlow } from "../../hooks/useDepositFlow";
import { addPendingPegin } from "../../storage/peginStorage";

interface CollateralDepositSignModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (btcTxid: string, ethTxHash: string) => void;
  amount: number;
  btcWalletProvider: any; // TODO: Type this properly with IBTCProvider
  depositorEthAddress: Address | undefined;
  selectedProviders: string[];
  vaultProviderBtcPubkey: string; // Vault provider's BTC public key from API
  liquidatorBtcPubkeys: string[]; // Liquidators' BTC public keys from API
}

export function CollateralDepositSignModal({
  open,
  onClose,
  onSuccess,
  amount,
  btcWalletProvider,
  depositorEthAddress,
  selectedProviders,
  vaultProviderBtcPubkey,
  liquidatorBtcPubkeys,
}: CollateralDepositSignModalProps) {
  const { executeDepositFlow, currentStep, processing, error } = useDepositFlow(
    {
      amount,
      btcWalletProvider,
      depositorEthAddress,
      selectedProviders,
      vaultProviderBtcPubkey,
      liquidatorBtcPubkeys,
      onSuccess: (btcTxid, ethTxHash) => {
        // Store pegin in localStorage for tracking
        if (depositorEthAddress) {
          addPendingPegin(depositorEthAddress, {
            id: ethTxHash,
            btcTxHash: btcTxid,
            amount: amount.toString(),
            providers: selectedProviders,
            ethAddress: depositorEthAddress,
            btcAddress: "", // Will be populated when needed
          });
        }

        // Call parent success handler
        onSuccess(btcTxid, ethTxHash);
      },
    },
  );

  // Execute flow when modal opens
  useEffect(() => {
    if (open && !processing && !error) {
      executeDepositFlow();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <ResponsiveDialog open={open} onClose={onClose}>
      <DialogHeader
        title="Deposit in Progress"
        onClose={onClose}
        className="text-accent-primary"
      />

      <DialogBody className="flex flex-col gap-4 px-4 pb-8 pt-4 text-accent-primary sm:px-6">
        <Text
          variant="body2"
          className="text-sm text-accent-secondary sm:text-base"
        >
          Please wait while we process your deposit
        </Text>

        <div className="flex flex-col items-start gap-4 py-4">
          <Step step={1} currentStep={currentStep}>
            Sign proof of possession
          </Step>
          <Step step={2} currentStep={currentStep}>
            Sign & broadcast collateral deposit request to Vault Controller
          </Step>
          <Step step={3} currentStep={currentStep}>
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
          onClick={error ? onClose : () => {}}
        >
          {processing && !error ? (
            <Loader size={16} className="text-accent-contrast" />
          ) : error ? (
            "Close"
          ) : (
            "View Position"
          )}
        </Button>
      </DialogFooter>
    </ResponsiveDialog>
  );
}
