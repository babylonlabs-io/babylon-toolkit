import { useEffect, useState } from "react";
import type { Address, Hex } from "viem";

import { usePeginPolling } from "@/context/deposit/PeginPollingContext";
import { useProtocolParamsContext } from "@/context/ProtocolParamsContext";
import { COPY } from "@/copy";
import { DepositFlowStep } from "@/hooks/deposit/depositFlowSteps";
import { deriveSplitVaultProgress } from "@/hooks/deposit/useSplitVaultProgress";
import { useBtcDepthStartedAt } from "@/hooks/useBtcDepthStartedAt";
import {
  getPeginDisplayStep,
  isVaultActivated,
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
    // This continuation view also drives the shared Pre-PegIn broadcast (see
    // the SIGN_AND_BROADCAST branch below), which `USER_ACTIONABLE_PEGIN_ACTIONS`
    // deliberately omits. Count it here so selection is explicit rather than
    // relying on the no-actionable fallback. Hardening only: broadcast is a
    // single shared tx, so when it's pending every sibling is at this same step
    // together — there is never an "earlier sibling past broadcast" to skip, so
    // the chosen index is index 0 either way.
    if (action === PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN) return true;
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
  perVaultSteps,
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
  perVaultSteps?: DepositFlowStep[];
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
      perVaultSteps={perVaultSteps}
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

  const isActionable = (id: string): boolean => {
    const state = getPollingResult(id)?.peginState;
    return isCandidateVault(state) && hasActionableStep(state, btcPublicKey);
  };

  // Which vault drives the rendered action branch. Two rules:
  //
  // 1. Prefer a vault with a user-actionable step over a sibling merely waiting
  //    on the VP — otherwise vault[0] in AWAIT_VP_VERIFICATION would stall
  //    vault[1]'s ready WOTS/payout/activation. Batches diverge because the VP
  //    processes each vault at its own rate.
  // 2. Stickiness: keep driving the SAME vault as long as it is still
  //    actionable. `currentVaultId` keys the rendered branch, so without this a
  //    polling tick that makes a *different* sibling actionable mid-action would
  //    flip the selection and unmount an in-flight Resume*Content — dropping a
  //    wallet-signing in progress. Re-select only once the held vault leaves
  //    actionable (advanced to a wait, went terminal/warning, or left the
  //    batch — all captured by `isActionable`).
  //
  // The progress columns (`perVaultSteps`) still update live per poll; only the
  // branch selection is sticky.
  const [stickyVaultId, setStickyVaultId] = useState<string | null>(null);
  const heldVaultId =
    stickyVaultId !== null &&
    vaultIds.includes(stickyVaultId as Hex) &&
    isActionable(stickyVaultId)
      ? stickyVaultId
      : null;
  const actionableVaultId = heldVaultId ?? vaultIds.find(isActionable) ?? null;

  const currentVaultIndex =
    actionableVaultId !== null
      ? vaultIds.indexOf(actionableVaultId as Hex)
      : // No sibling is actionable — fall back to the first candidate so its
        // wait state still renders.
        vaultIds.findIndex((id) =>
          isCandidateVault(getPollingResult(id)?.peginState),
        );
  const currentVaultId =
    currentVaultIndex === -1 ? undefined : vaultIds[currentVaultIndex];

  // Remember the actionable vault we're driving so the next render's
  // stickiness check can hold it. Sync unconditionally — clearing to null when
  // nothing is actionable — so that re-entering an actionable state from a wait
  // re-selects fresh (first actionable) rather than resurfacing a stale prior
  // pick. (Holding mid-action is governed by `heldVaultId` above, which only
  // sticks while the vault stays continuously actionable, so this never drops a
  // branch that's in flight.)
  useEffect(() => {
    setStickyVaultId(actionableVaultId);
  }, [actionableVaultId]);
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
  // Cheap copy (not a readonly-laundering cast) so callers can't mutate the prop.
  const siblingVaultIds: string[] = [...vaultIds];
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
        // Plural only when EVERY vault in the batch is actually activated
        // (ACTIVE / optimistic VERIFIED+CONFIRMED) — an explicit guard rather
        // than trusting the "no candidate ⇒ all done" invariant, so a
        // terminal-but-not-activated sibling can never read as "activated".
        successMessage={
          vaultCount > 1 &&
          vaultIds.every((id) =>
            isVaultActivated(getPollingResult(id)?.peginState),
          )
            ? COPY.deposit.resume.activationSuccessMessagePlural
            : COPY.deposit.resume.activationSuccessMessage
        }
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

  // Each sibling column reflects its own polled step (the columns diverge on
  // resume), with this vault's wait step as the active column.
  const { perVaultSteps } = deriveSplitVaultProgress(
    getPollingResult,
    siblingVaultIds,
    currentVaultId,
    waitStep,
  );

  return (
    <StatusView
      currentStep={waitStep}
      vaultCount={vaultCount}
      currentVaultIndex={currentVaultIndex >= 0 ? currentVaultIndex : null}
      perVaultSteps={perVaultSteps}
      isProcessing
      canContinueInBackground
      onClose={onClose}
      btcConfirmationDetail={btcConfirmationDetail}
    />
  );
}
