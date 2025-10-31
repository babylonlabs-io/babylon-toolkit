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

import { addPendingPegin } from "../../../../../storage/peginStorage";

import { useDepositFlow } from "./hooks/useDepositFlow";

interface CollateralDepositSignModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (btcTxid: string, ethTxHash: string) => void;
  amount: bigint; // in satoshis
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
  // Track if flow has been executed to prevent duplicate executions
  const hasExecutedRef = useRef(false);

  const { executeDepositFlow, currentStep, processing, error } = useDepositFlow(
    {
      amount,
      btcWalletProvider,
      depositorEthAddress,
      selectedProviders,
      vaultProviderBtcPubkey,
      liquidatorBtcPubkeys,
      onSuccess: (btcTxid, ethTxHash) => {
        // Store pegin in localStorage for tracking (minimal data - full data refetched from blockchain)
        if (depositorEthAddress) {
          addPendingPegin(depositorEthAddress, {
            id: ethTxHash,
          });
        }

        // Call parent success handler
        onSuccess(btcTxid, ethTxHash);
      },
    },
  );

  useEffect(() => {
    if (!open) {
      hasExecutedRef.current = false;
    }
  }, [open]);

  useEffect(() => {
    if (open && !processing && !error && !hasExecutedRef.current) {
      hasExecutedRef.current = true;
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
