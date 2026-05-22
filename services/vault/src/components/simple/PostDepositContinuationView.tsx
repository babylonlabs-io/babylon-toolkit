import type { Address, Hex } from "viem";

import { usePeginPolling } from "@/context/deposit/PeginPollingContext";
import { COPY } from "@/copy";
import { DepositFlowStep } from "@/hooks/deposit/depositFlowSteps";
import {
  ContractStatus,
  getPeginDisplayStep,
  LocalStorageStatus,
  PeginAction,
  type PeginState,
} from "@/models/peginStateMachine";
import type { VaultActivity } from "@/types/activity";

import { ActivationGate } from "./ActivationGate";
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

function isVaultPastActivation(peginState: PeginState | undefined): boolean {
  if (!peginState) return false;
  const { contractStatus, localStatus } = peginState;
  if (
    contractStatus === ContractStatus.VERIFIED &&
    localStatus === LocalStorageStatus.CONFIRMED
  ) {
    return true;
  }
  return (
    contractStatus === ContractStatus.ACTIVE ||
    contractStatus === ContractStatus.REDEEMED ||
    contractStatus === ContractStatus.LIQUIDATED ||
    contractStatus === ContractStatus.DEPOSITOR_WITHDRAWN
  );
}

function StatusView({
  currentStep,
  onClose,
  error = null,
  isComplete = false,
  isProcessing = false,
  canContinueInBackground = false,
  successMessage,
}: {
  currentStep: DepositFlowStep;
  onClose: () => void;
  error?: string | null;
  isComplete?: boolean;
  isProcessing?: boolean;
  canContinueInBackground?: boolean;
  successMessage?: string;
}) {
  return (
    <DepositProgressView
      currentStep={currentStep}
      error={error}
      isComplete={isComplete}
      isProcessing={isProcessing}
      canClose
      canContinueInBackground={canContinueInBackground}
      payoutSigningProgress={null}
      peginSigningProgress={null}
      onClose={onClose}
      successMessage={successMessage}
    />
  );
}

export function PostDepositContinuationView({
  vaultIds,
  activities,
  depositorEthAddress,
  btcPublicKey,
  onClose,
}: PostDepositContinuationViewProps) {
  const { refetch, getPollingResult } = usePeginPolling();

  const currentVaultIndex = vaultIds.findIndex((id) => {
    const state = getPollingResult(id)?.peginState;
    return !isVaultPastActivation(state) && state?.displayVariant !== "warning";
  });
  const currentVaultId =
    currentVaultIndex === -1 ? undefined : vaultIds[currentVaultIndex];
  const pollingResult = currentVaultId
    ? getPollingResult(currentVaultId)
    : undefined;
  const activity = currentVaultId
    ? activities.find((a) => a.id === currentVaultId)
    : undefined;

  if (!currentVaultId) {
    const warning = vaultIds
      .map((id) => getPollingResult(id)?.peginState)
      .find((state) => state?.displayVariant === "warning");
    if (warning) {
      return (
        <StatusView
          currentStep={DepositFlowStep.ACTIVATE_VAULT}
          error={warning.message ?? COPY.common.somethingWentWrong.body}
          onClose={onClose}
        />
      );
    }
    return (
      <StatusView
        currentStep={DepositFlowStep.COMPLETED}
        isComplete
        onClose={onClose}
        successMessage={COPY.deposit.resume.activationSuccessMessage}
      />
    );
  }

  const peginState = pollingResult?.peginState;
  const actions = peginState?.availableActions ?? [];

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
    return (
      <ActivationGate
        key={`gate-${currentVaultId}`}
        activity={activity}
        onClose={onClose}
      >
        <ResumeActivationContent
          activity={activity}
          depositorEthAddress={depositorEthAddress}
          onClose={onClose}
          onSuccess={refetch}
        />
      </ActivationGate>
    );
  }

  const waitStep = peginState
    ? (getPeginDisplayStep(peginState) ?? DepositFlowStep.ACTIVATE_VAULT)
    : DepositFlowStep.AWAIT_BTC_CONFIRMATION;

  return (
    <StatusView
      currentStep={waitStep}
      isProcessing
      canContinueInBackground
      onClose={onClose}
    />
  );
}
