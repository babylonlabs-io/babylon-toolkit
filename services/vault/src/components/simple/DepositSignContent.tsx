/**
 * DepositSignContent
 *
 * Renders the signing modal content for deposits. Always uses array-based
 * props — single vault is an array of 1. Multi-vault renders the same
 * stepper rows as single-vault; per-vault progress is surfaced via
 * `payoutSigningProgress`.
 */

import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import { useCallback, useState } from "react";
import type { Address, Hex } from "viem";

import { ArtifactDownloadModal } from "@/components/deposit/ArtifactDownloadModal";
import { computeDepositDerivedState } from "@/components/deposit/DepositSignModal/depositStepHelpers";
import { useDepositFlow } from "@/hooks/deposit/useDepositFlow";
import { useRunOnce } from "@/hooks/useRunOnce";

import { DepositProgressView } from "./DepositProgressView";
import { PostDepositContinuationContent } from "./PostDepositContinuationContent";

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
    lastWarnings,
    isWaiting,
    payoutSigningProgress,
    peginSigningProgress,
    artifactDownloadInfo,
    continueAfterArtifactDownload,
    btcConfirmationDetail,
  } = useDepositFlow({
    vaultAmounts,
    ...flowParams,
  });

  const [continuationVaultIds, setContinuationVaultIds] = useState<
    Hex[] | null
  >(null);

  const startFlow = useCallback(async () => {
    const result = await executeDeposit();
    if (result) {
      onRefetchActivities?.();
      setContinuationVaultIds(result.pegins.map((pegin) => pegin.vaultId));
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

  // Hoisted above the success/processing split so the post-hoc reuse warning
  // remains visible after the flow resolves and the view switches to the
  // post-deposit continuation surface. Rendering it only in the
  // DepositProgressView branch would make the banner disappear the moment
  // `continuationVaultIds` is set — the exact case where the warning matters.
  const warningsBanner = lastWarnings.length > 0 && (
    <div
      className="mb-3 flex flex-col gap-1 rounded-lg bg-amber-100 px-4 py-3 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
      role="alert"
    >
      {lastWarnings.map((w, i) => (
        <div key={i} className="text-sm">
          {w}
        </div>
      ))}
    </div>
  );

  if (
    continuationVaultIds &&
    continuationVaultIds.length > 0 &&
    flowParams.depositorEthAddress
  ) {
    return (
      <>
        {warningsBanner}
        <PostDepositContinuationContent
          vaultIds={continuationVaultIds}
          depositorEthAddress={flowParams.depositorEthAddress}
          onClose={onClose}
        />
      </>
    );
  }

  return (
    <>
      {warningsBanner}

      <DepositProgressView
        currentStep={currentStep}
        error={error}
        isComplete={isComplete}
        isProcessing={isProcessing}
        canClose={canClose}
        canContinueInBackground={canContinueInBackground}
        payoutSigningProgress={payoutSigningProgress}
        peginSigningProgress={peginSigningProgress}
        onClose={handleClose}
        btcConfirmationDetail={btcConfirmationDetail}
      />

      {artifactDownloadInfo && (
        <ArtifactDownloadModal
          open
          onClose={handleClose}
          onComplete={continueAfterArtifactDownload}
          providerAddress={artifactDownloadInfo.providerAddress}
          peginTxid={artifactDownloadInfo.peginTxid}
          depositorPk={artifactDownloadInfo.depositorPk}
          vaultId={artifactDownloadInfo.vaultId}
          unsignedPrePeginTxHex={artifactDownloadInfo.unsignedPrePeginTxHex}
        />
      )}
    </>
  );
}
