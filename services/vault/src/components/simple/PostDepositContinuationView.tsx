import type { Address, Hex } from "viem";

import { usePeginPolling } from "@/context/deposit/PeginPollingContext";
import { useProtocolParamsContext } from "@/context/ProtocolParamsContext";
import { COPY } from "@/copy";
import { DepositFlowStep } from "@/hooks/deposit/depositFlowSteps";
import { useBtcDepthStartedAt } from "@/hooks/useBtcDepthStartedAt";
import {
  getPeginDisplayStep,
  isVaultPastActivation,
  LocalStorageStatus,
  PeginAction,
  type PeginState,
  USER_ACTIONABLE_PEGIN_ACTIONS,
} from "@/models/peginStateMachine";
import type { VaultActivity } from "@/types/activity";
import { type DepositErrorContent, mapDepositError } from "@/utils/errors";

import { ActivationGate } from "./ActivationGate";
import {
  type BtcConfirmationDetailData,
  DepositProgressView,
} from "./DepositProgressView";
import {
  ResumeActivationContent,
  ResumeBroadcastContent,
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
  btcConfirmationDetail = null,
  vaultCount = 1,
  currentVaultIndex = null,
}: {
  currentStep: DepositFlowStep;
  onClose: () => void;
  error?: DepositErrorContent | null;
  isComplete?: boolean;
  isProcessing?: boolean;
  canContinueInBackground?: boolean;
  successMessage?: string;
  btcConfirmationDetail?: BtcConfirmationDetailData | null;
  vaultCount?: number;
  currentVaultIndex?: number | null;
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
      vaultCount={vaultCount}
      currentVaultIndex={currentVaultIndex}
      onClose={onClose}
      successMessage={successMessage}
      btcConfirmationDetail={btcConfirmationDetail}
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
  const { config, getOffchainParamsByVersion } = useProtocolParamsContext();

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

  // Hoisted above the early returns to satisfy Rules of Hooks. When no
  // vault is selected, showBtcDepthPanel is false and the hook no-ops.
  const peginState = pollingResult?.peginState;
  const waitStep = peginState
    ? (getPeginDisplayStep(peginState) ?? DepositFlowStep.ACTIVATE_VAULT)
    : DepositFlowStep.AWAIT_BTC_CONFIRMATION;
  const showBtcDepthPanel =
    waitStep === DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS &&
    Boolean(activity?.prePeginTxHash);
  const startedAt = useBtcDepthStartedAt(activity?.id, showBtcDepthPanel);

  // Pass to every branch so split deposits render the multi-column UI with
  // the current vault highlighted. A single-vault deposit yields vaultCount=1
  // and the progress view falls back to its original single-column layout.
  const siblingVaultIds = vaultIds as readonly string[] as string[];
  const vaultCount = siblingVaultIds.length || 1;

  if (!currentVaultId) {
    const warning = vaultIds
      .map((id) => getPollingResult(id)?.peginState)
      .find((state) => state?.displayVariant === "warning");
    if (warning) {
      // Freeze the stepper at the point of failure based on the vault's
      // last persisted localStatus — `getPeginDisplayStep` is null for
      // warning states by design, so we map it ourselves.
      const warningIndex = vaultIds.findIndex(
        (id) => getPollingResult(id)?.peginState === warning,
      );
      return (
        <StatusView
          currentStep={stepForWarningVault(warning)}
          error={mapDepositError(
            warning.message ?? COPY.common.somethingWentWrong.body,
          )}
          onClose={onClose}
          vaultCount={vaultCount}
          currentVaultIndex={warningIndex >= 0 ? warningIndex : null}
        />
      );
    }
    return (
      <StatusView
        currentStep={DepositFlowStep.COMPLETED}
        isComplete
        onClose={onClose}
        successMessage={COPY.deposit.resume.activationSuccessMessage}
        vaultCount={vaultCount}
        currentVaultIndex={null}
      />
    );
  }

  const actions = peginState?.availableActions ?? [];

  // Action-driven branches. Broadcast comes first because it has to happen
  // before any of the per-vault VP steps; the action availability already
  // guarantees at most one branch matches.
  //
  // Artifact download is NOT auto-invoked: it's a real file download and
  // silent downloads are user-hostile (the browser may block, the user may
  // not be ready). The ActivationGate below renders a manual download
  // button once that step is reached.

  if (activity && actions.includes(PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN)) {
    return (
      <ResumeBroadcastContent
        key={`broadcast-${currentVaultId}`}
        activity={activity}
        batchVaultIds={siblingVaultIds}
        depositorEthAddress={depositorEthAddress}
        onClose={onClose}
        onSuccess={refetch}
      />
    );
  }

  if (activity && actions.includes(PeginAction.SUBMIT_WOTS_KEY)) {
    return (
      <ResumeWotsContent
        key={`wots-${currentVaultId}`}
        activity={activity}
        siblingVaultIds={siblingVaultIds}
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
        siblingVaultIds={siblingVaultIds}
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
          siblingVaultIds={siblingVaultIds}
          onClose={onClose}
          onSuccess={refetch}
        />
      </ActivationGate>
    );
  }

  // requiredDepth pinned to the deposit's registered offchain-params version
  // (matches PeginPollingContext.getRequiredPrePeginDepth).
  const requiredDepth =
    (activity?.offchainParamsVersion !== undefined
      ? getOffchainParamsByVersion(activity.offchainParamsVersion)
          ?.minPrepeginDepth
      : undefined) ?? config.offchainParams.minPrepeginDepth;
  const btcConfirmationDetail: BtcConfirmationDetailData | null =
    showBtcDepthPanel && activity?.prePeginTxHash && startedAt
      ? {
          startedAt,
          prePeginTxid: activity.prePeginTxHash,
          requiredDepth,
          // Pass the whole batch — siblings share this broadcast, and the
          // container picks the first indexed sibling for coalesced counts.
          depositIds: vaultIds,
        }
      : null;

  return (
    <StatusView
      currentStep={waitStep}
      vaultCount={vaultCount}
      currentVaultIndex={currentVaultIndex >= 0 ? currentVaultIndex : null}
      isProcessing
      canContinueInBackground
      onClose={onClose}
      btcConfirmationDetail={btcConfirmationDetail}
    />
  );
}
