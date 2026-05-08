/**
 * DepositSignContent
 *
 * Renders the signing modal content for deposits. Always uses array-based
 * props — single vault is an array of 1. Multi-vault renders the same
 * stepper rows as single-vault; per-vault progress is surfaced via
 * `payoutSigningProgress`.
 */

import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import { useCallback } from "react";
import type { Address } from "viem";

import { ArtifactDownloadModal } from "@/components/deposit/ArtifactDownloadModal";
import { computeDepositDerivedState } from "@/components/deposit/DepositSignModal/depositStepHelpers";
import { useDepositFlow } from "@/hooks/deposit/useDepositFlow";
import { useRunOnce } from "@/hooks/useRunOnce";

import { DepositProgressView } from "./DepositProgressView";

interface DepositSignContentProps {
  vaultAmounts: bigint[];
  mempoolFeeRate: number;
  btcWalletProvider: BitcoinWallet;
  depositorEthAddress: Address | undefined;
  selectedApplication: string;
  selectedProviders: string[];
  vaultProviderBtcPubkey: string;
  vaultKeeperBtcPubkeys: string[];
  universalChallengerBtcPubkeys: string[];
  onClose: () => void;
  onRefetchActivities?: () => Promise<void>;
}

export function DepositSignContent({
  onClose,
  onRefetchActivities,
  vaultAmounts,
  ...flowParams
}: DepositSignContentProps) {
  const {
    executeDeposit,
    abort,
    currentStep,
    processing,
    error,
    isWaiting,
    payoutSigningProgress,
    artifactDownloadInfo,
    continueAfterArtifactDownload,
  } = useDepositFlow({
    vaultAmounts,
    ...flowParams,
  });

  const startFlow = useCallback(async () => {
    const result = await executeDeposit();
    if (result) {
      onRefetchActivities?.();
    }
  }, [executeDeposit, onRefetchActivities]);

  useRunOnce(startFlow);

  // Derived state
  const { isComplete, canClose, isProcessing, canContinueInBackground } =
    computeDepositDerivedState(currentStep, processing, isWaiting, error);

  const handleClose = useCallback(() => {
    abort();
    onClose();
  }, [abort, onClose]);

  return (
    <>
      <DepositProgressView
        currentStep={currentStep}
        error={error}
        isComplete={isComplete}
        isProcessing={isProcessing}
        canClose={canClose}
        canContinueInBackground={canContinueInBackground}
        payoutSigningProgress={payoutSigningProgress}
        onClose={handleClose}
      />

      {artifactDownloadInfo && (
        <ArtifactDownloadModal
          open
          onClose={handleClose}
          onComplete={continueAfterArtifactDownload}
          providerAddress={artifactDownloadInfo.providerAddress}
          peginTxid={artifactDownloadInfo.peginTxid}
          depositorPk={artifactDownloadInfo.depositorPk}
        />
      )}
    </>
  );
}
