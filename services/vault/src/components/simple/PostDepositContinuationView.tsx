import { useCallback, useState } from "react";
import type { Address, Hex } from "viem";

import { ArtifactDownloadModal } from "@/components/deposit/ArtifactDownloadModal";
import {
  useDepositPollingResult,
  usePeginPolling,
} from "@/context/deposit/PeginPollingContext";
import { COPY } from "@/copy";
import { DepositFlowStep } from "@/hooks/deposit/depositFlowSteps";
import { getPeginDisplayStep, PeginAction } from "@/models/peginStateMachine";
import type { VaultActivity } from "@/types/activity";
import { hasArtifactsDownloaded } from "@/utils/artifactDownloadStorage";

import { DepositProgressView } from "./DepositProgressView";
import {
  ResumeActivationContent,
  ResumeSignContent,
  ResumeWotsContent,
} from "./ResumeDepositContent";

interface PostDepositContinuationViewProps {
  vaultIds: Hex[];
  activities: VaultActivity[];
  depositorEthAddress: Address;
  btcPublicKey: string | undefined;
  onClose: () => void;
}

export function PostDepositContinuationView({
  vaultIds,
  activities,
  depositorEthAddress,
  btcPublicKey,
  onClose,
}: PostDepositContinuationViewProps) {
  const [currentVaultIndex, setCurrentVaultIndex] = useState(0);
  const [artifactResolvedVaultIds, setArtifactResolvedVaultIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const { refetch } = usePeginPolling();

  const currentVaultId = vaultIds[currentVaultIndex];
  const pollingResult = useDepositPollingResult(currentVaultId ?? "");
  const activity = currentVaultId
    ? activities.find((a) => a.id === currentVaultId)
    : undefined;

  // Keyed to the shown index so a StrictMode double-success cannot skip a vault.
  const advanceFrom = useCallback((fromIndex: number) => {
    setCurrentVaultIndex((index) => (index === fromIndex ? index + 1 : index));
  }, []);

  const resolveArtifact = useCallback((vaultId: string) => {
    setArtifactResolvedVaultIds((prev) => {
      if (prev.has(vaultId)) return prev;
      const next = new Set(prev);
      next.add(vaultId);
      return next;
    });
  }, []);

  if (!currentVaultId) {
    return (
      <DepositProgressView
        currentStep={DepositFlowStep.COMPLETED}
        error={null}
        isComplete
        isProcessing={false}
        canClose
        canContinueInBackground={false}
        payoutSigningProgress={null}
        peginSigningProgress={null}
        onClose={onClose}
        successMessage={COPY.deposit.resume.activationSuccessMessage}
      />
    );
  }

  const peginState = pollingResult?.peginState;
  const actions = peginState?.availableActions ?? [];
  const isWarning = peginState?.displayVariant === "warning";

  if (isWarning) {
    return (
      <DepositProgressView
        currentStep={DepositFlowStep.ACTIVATE_VAULT}
        error={peginState?.message ?? COPY.common.somethingWentWrong.body}
        isComplete={false}
        isProcessing={false}
        canClose
        canContinueInBackground={false}
        payoutSigningProgress={null}
        peginSigningProgress={null}
        onClose={onClose}
      />
    );
  }

  if (activity && actions.includes(PeginAction.SUBMIT_WOTS_KEY)) {
    return (
      <ResumeWotsContent
        key={`wots-${currentVaultId}`}
        activity={activity}
        onClose={onClose}
        onSuccess={refetch}
      />
    );
  }

  if (
    activity &&
    btcPublicKey &&
    actions.includes(PeginAction.SIGN_PAYOUT_TRANSACTIONS)
  ) {
    return (
      <ResumeSignContent
        key={`payout-${currentVaultId}`}
        activity={activity}
        btcPublicKey={btcPublicKey}
        depositorEthAddress={depositorEthAddress}
        onClose={onClose}
        onSuccess={refetch}
      />
    );
  }

  if (activity && actions.includes(PeginAction.ACTIVATE_VAULT)) {
    const providerAddress = activity.providers?.[0]?.id;
    const peginTxid = activity.peginTxHash;
    const depositorPk = activity.depositorBtcPubkey;
    const canDownloadArtifacts =
      !!providerAddress && !!peginTxid && !!depositorPk;
    const needsArtifactDownload =
      canDownloadArtifacts &&
      !artifactResolvedVaultIds.has(currentVaultId) &&
      !hasArtifactsDownloaded(currentVaultId);

    if (needsArtifactDownload) {
      return (
        <ArtifactDownloadModal
          open
          providerAddress={providerAddress as string}
          peginTxid={peginTxid as string}
          depositorPk={depositorPk as string}
          vaultId={currentVaultId}
          unsignedPrePeginTxHex={activity.unsignedPrePeginTx}
          onClose={onClose}
          onComplete={() => resolveArtifact(currentVaultId)}
        />
      );
    }

    const isLastVault = currentVaultIndex >= vaultIds.length - 1;
    return (
      <ResumeActivationContent
        key={`activate-${currentVaultId}`}
        activity={activity}
        depositorEthAddress={depositorEthAddress}
        onClose={onClose}
        onSuccess={isLastVault ? onClose : () => advanceFrom(currentVaultIndex)}
      />
    );
  }

  const waitStep = peginState
    ? (getPeginDisplayStep(peginState) ?? DepositFlowStep.ACTIVATE_VAULT)
    : DepositFlowStep.AWAIT_BTC_CONFIRMATION;

  return (
    <DepositProgressView
      currentStep={waitStep}
      error={null}
      isComplete={false}
      isProcessing
      canClose
      canContinueInBackground
      payoutSigningProgress={null}
      peginSigningProgress={null}
      onClose={onClose}
    />
  );
}
