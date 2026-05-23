import type { Address, Hex } from "viem";

import { usePeginPolling } from "@/context/deposit/PeginPollingContext";
import { COPY } from "@/copy";
import { DepositFlowStep } from "@/hooks/deposit/depositFlowSteps";
import {
  getPeginDisplayStep,
  isVaultPastActivation,
  LocalStorageStatus,
  PeginAction,
  type PeginState,
  USER_ACTIONABLE_PEGIN_ACTIONS,
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

function isCandidateVault(state: PeginState | undefined): boolean {
  return (
    !!state &&
    !isVaultPastActivation(state) &&
    state.displayVariant !== "warning"
  );
}

function hasActionableStep(
  state: PeginState | undefined,
  btcPublicKey: string | undefined,
): boolean {
  if (!state) return false;
  return (state.availableActions ?? []).some((action) => {
    if (!USER_ACTIONABLE_PEGIN_ACTIONS.has(action)) return false;
    // Mirror the render-branch prerequisite: payout signing also needs the
    // depositor's BTC public key. Without this check a payout-only vault
    // wins actionableIndex, fails the payout branch, and renders the wait
    // view — stalling a later vault with a genuinely-actionable step.
    if (action === PeginAction.SIGN_PAYOUT_TRANSACTIONS) {
      return btcPublicKey !== undefined;
    }
    return true;
  });
}

/**
 * Step to freeze the stepper on for a warning (terminal failure) vault.
 *
 * `getPeginDisplayStep` returns `null` for warning states by design — it
 * never shows progress for a failed deposit. We derive a frozen step from
 * the vault's last persisted local status so the stepper shows the point
 * of failure rather than a generic "Awaiting BTC confirmation."
 */
function stepForWarningVault(state: PeginState): DepositFlowStep {
  switch (state.localStatus) {
    case LocalStorageStatus.CONFIRMED:
      return DepositFlowStep.ACTIVATE_VAULT;
    case LocalStorageStatus.PAYOUT_SIGNED:
      return DepositFlowStep.AWAIT_VP_VERIFICATION;
    case LocalStorageStatus.CONFIRMING:
      return DepositFlowStep.AWAIT_BTC_CONFIRMATION;
    case LocalStorageStatus.PENDING:
      return DepositFlowStep.BROADCAST_PRE_PEGIN;
    default:
      return DepositFlowStep.AWAIT_BTC_CONFIRMATION;
  }
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

  // Prefer a vault with a user-actionable step over a sibling that's
  // merely waiting on the VP. Otherwise vault[0] in AWAIT_VP_VERIFICATION
  // would stall vault[1]'s ready WOTS/payout/activation action — batches
  // realistically diverge because the VP processes each vault at its own
  // rate. Falls back to the first candidate so its wait state still shows
  // when no sibling is actionable.
  const actionableIndex = vaultIds.findIndex((id) => {
    const state = getPollingResult(id)?.peginState;
    return isCandidateVault(state) && hasActionableStep(state, btcPublicKey);
  });
  const currentVaultIndex =
    actionableIndex !== -1
      ? actionableIndex
      : vaultIds.findIndex((id) =>
          isCandidateVault(getPollingResult(id)?.peginState),
        );
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
      // Freeze the stepper at the point of failure based on the vault's
      // last persisted localStatus — `getPeginDisplayStep` is null for
      // warning states by design, so we map it ourselves.
      return (
        <StatusView
          currentStep={stepForWarningVault(warning)}
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

  // Action-driven branches. PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN is
  // intentionally absent: the continuation only mounts after
  // `executeDeposit()` resolves (Pre-PegIn broadcast + localStorage past
  // CONFIRMING), so that action is never in `actions` here — the dashboard
  // resume path covers sessions that aborted before broadcast.
  //
  // Artifact download is NOT auto-invoked: it's a real file download and
  // silent downloads are user-hostile (the browser may block, the user may
  // not be ready). The ActivationGate below renders a manual download
  // button once that step is reached.

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
