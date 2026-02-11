/**
 * Multi-Vault Deposit Sign Modal
 *
 * Handles the signing flow for creating multiple vaults in a single batch.
 * Shows progress for split transaction signing and per-vault creation.
 */

import {
  Button,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Loader,
  ResponsiveDialog,
  Text,
} from "@babylonlabs-io/core-ui";
import { useCallback, useEffect } from "react";
import type { Address } from "viem";

import { DepositStep } from "@/hooks/deposit/depositFlowSteps";
import { useMultiVaultDepositFlow } from "@/hooks/deposit/useMultiVaultDepositFlow";
import { useOnModalOpen } from "@/hooks/useOnModalOpen";

import { StatusBanner } from "../DepositSignModal/StatusBanner";

import { MultiVaultProgress } from "./MultiVaultProgress";
import { canCloseModal, getMultiVaultStepDescription } from "./utils";

interface MultiVaultSignModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  vaultAmounts: bigint[];
  feeRate: number;
  btcWalletProvider: any;
  depositorEthAddress: Address | undefined;
  selectedApplication: string;
  selectedProviders: string[];
  vaultProviderBtcPubkey: string;
  vaultKeeperBtcPubkeys: string[];
  universalChallengerBtcPubkeys: string[];
  onRefetchActivities?: () => Promise<void>;
}

export function MultiVaultSignModal({
  open,
  onClose,
  onSuccess,
  vaultAmounts,
  feeRate,
  btcWalletProvider,
  depositorEthAddress,
  selectedApplication,
  selectedProviders,
  vaultProviderBtcPubkey,
  vaultKeeperBtcPubkeys,
  universalChallengerBtcPubkeys,
  onRefetchActivities,
}: MultiVaultSignModalProps) {
  const {
    executeMultiVaultDeposit,
    currentStep,
    currentVaultIndex,
    processing,
    error,
    isWaiting,
  } = useMultiVaultDepositFlow({
    vaultAmounts,
    feeRate,
    btcWalletProvider,
    depositorEthAddress,
    selectedApplication,
    selectedProviders,
    vaultProviderBtcPubkey,
    vaultKeeperBtcPubkeys,
    universalChallengerBtcPubkeys,
  });

  // Execute flow once when modal opens
  const handleExecuteFlow = useCallback(async () => {
    await executeMultiVaultDeposit();
  }, [executeMultiVaultDeposit]);

  useOnModalOpen(open, handleExecuteFlow);

  const isComplete = currentStep === DepositStep.COMPLETED;
  const canClose = canCloseModal(currentStep, error);
  const isProcessing = (processing || isWaiting) && !error && !isComplete;

  // Auto-close modal when flow completes successfully
  useEffect(() => {
    if (isComplete && !error) {
      // Refetch activities and trigger success callback
      const handleSuccess = async () => {
        await onRefetchActivities?.();
        onSuccess();
      };
      handleSuccess();
    }
  }, [isComplete, error, onRefetchActivities, onSuccess]);

  return (
    <ResponsiveDialog open={open} onClose={canClose ? onClose : undefined}>
      <DialogHeader
        title={`Creating ${vaultAmounts.length} Vaults`}
        onClose={canClose ? onClose : undefined}
        className="text-accent-primary"
      />

      <DialogBody className="flex flex-col gap-4 px-4 pb-8 pt-4 text-accent-primary sm:px-6">
        <Text
          variant="body2"
          className="text-sm text-accent-secondary sm:text-base"
        >
          {getMultiVaultStepDescription(
            currentStep,
            currentVaultIndex,
            vaultAmounts.length,
            isWaiting,
          )}
        </Text>

        <MultiVaultProgress
          currentStep={currentStep}
          currentVaultIndex={currentVaultIndex}
          totalVaults={vaultAmounts.length}
          isWaiting={isWaiting}
        />

        {error && <StatusBanner variant="error">{error}</StatusBanner>}

        {isComplete && (
          <StatusBanner variant="success">
            Successfully submitted {vaultAmounts.length} vaults to Ethereum!
            Please wait for Payout transactions.
          </StatusBanner>
        )}
      </DialogBody>

      <DialogFooter className="px-4 pb-6 sm:px-6">
        <Button
          disabled={isProcessing}
          variant="contained"
          className="w-full text-xs sm:text-base"
          onClick={canClose ? onClose : undefined}
        >
          {isProcessing ? (
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
