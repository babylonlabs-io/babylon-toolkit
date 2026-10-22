import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router";
import type { Address, Hex } from "viem";

import { usePeginPolling } from "@/context/deposit/PeginPollingContext";
import { COPY } from "@/copy";
import { DepositFlowStep } from "@/hooks/deposit/depositFlowSteps";
import { useRequiredPrePeginDepth } from "@/hooks/deposit/useRequiredPrePeginDepth";
import { deriveSplitVaultProgress } from "@/hooks/deposit/useSplitVaultProgress";
import { useBtcAction } from "@/hooks/useBtcAction";
import {
  ContractStatus,
  getPeginProgressStep,
  getWarningPeginDisplayStep,
  hasActionableStep,
  isCandidateVault,
  isVaultActivated,
  isVaultActivationReturned,
  isVaultPastActivation,
  PeginAction,
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
import { VaultActivatedView } from "./VaultActivatedView";
import { VaultReturnedView } from "./VaultReturnedView";

// God-mode only: simulated activation content for demo vault ids. Lazy +
// import.meta.env.DEV so the module (and the demo store it pulls in) is
// tree-shaken from production builds, mirroring the DashboardPage pattern.
const DemoActivationContent = import.meta.env.DEV
  ? lazy(() => import("@/dev/DemoActivationContent"))
  : null;

interface PostDepositContinuationViewProps {
  vaultIds: Hex[];
  activities: VaultActivity[];
  depositorEthAddress: Address;
  btcPublicKey: string | undefined;
  /**
   * God-mode demo vault ids present in this batch (dev only; empty/undefined in
   * production). When the driven vault is one of these, the activation branch
   * runs the SIMULATED activation instead of the real wallet/contract path.
   */
  demoVaultIds?: ReadonlySet<string>;
  /**
   * The action the opener asked for: a branch auto-starts only when it matches.
   * "any" is the in-flight deposit session; null names nothing (View Details).
   */
  autoStartAction: PeginAction | "any" | null;
  onClose: () => void;
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
  offchainParamsVersion,
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
  offchainParamsVersion?: number;
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
      offchainParamsVersion={offchainParamsVersion}
    />
  );
}

export function PostDepositContinuationView({
  vaultIds,
  activities,
  depositorEthAddress,
  btcPublicKey,
  demoVaultIds,
  autoStartAction,
  onClose,
}: PostDepositContinuationViewProps) {
  const { connected, btcConnected, sessionConfirmed, locked } = useBtcAction();
  // The named row click is the consent, so a wallet that is merely locked at
  // mount is admitted and its flow starts on unlock, as in BtcActionGate.
  const [admitted, setAdmitted] = useState(btcConnected && sessionConfirmed);
  const [keyWasReady, setKeyWasReady] = useState(!!btcPublicKey);
  if (btcPublicKey && !keyWasReady) setKeyWasReady(true);
  // Allow the first key read. A lost session or key withdraws admission, so the
  // branch waits on its named Start card rather than prompting on reconnect.
  // Nothing is withdrawn while locked: the key read fails until the unlock.
  if (admitted && !locked && (!connected || (keyWasReady && !btcPublicKey))) {
    setAdmitted(false);
  }
  // A wallet prompt opens without a click only for the action the opener named;
  // any other branch waits for the depositor in its gate.
  const autoStart = (action: PeginAction) =>
    admitted && (autoStartAction === "any" || autoStartAction === action);
  const { refetch, getPollingResult, activationReturnedReasons } =
    usePeginPolling();
  const navigate = useNavigate();

  // Refresh on open because the shared poll can stop before this view mounts.
  // Use a ref: a changed refetch callback must not start another request.
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  useEffect(() => {
    refetchRef.current();
  }, []);

  const handleGoToDashboard = useCallback(() => {
    navigate("/", { replace: true });
    onClose();
  }, [navigate, onClose]);

  // Use the on-chain key so a disconnected wallet can see the payout prompt.
  const isActionable = (id: string): boolean => {
    const result = getPollingResult(id);
    return (
      isCandidateVault(result?.peginState) &&
      hasActionableStep(result?.peginState, result?.depositorBtcPubkey)
    );
  };

  // Only a PENDING vault is polled, so only its poll can still answer. A later
  // status keeps the last PENDING tick's error for good; do not hold on it.
  // A vault missing from a tick has not answered either.
  const isUnresolved = (id: string): boolean => {
    const result = getPollingResult(id);
    if (!result) return true;
    return (
      isCandidateVault(result.peginState) &&
      result.peginState.contractStatus === ContractStatus.PENDING &&
      (result.loading || result.error !== null)
    );
  };

  // Prefer a vault with an available action over a waiting sibling.
  // Keep that vault selected while its action remains available, or while its
  // poll failed or has not answered yet. A new action on a sibling must not
  // unmount active signing. Release on a resolved snapshot without an action.
  const [stickyVaultId, setStickyVaultId] = useState<string | null>(null);
  const heldActionsRef = useRef<readonly PeginAction[]>([]);
  const heldActivityRef = useRef<VaultActivity | undefined>(undefined);
  const heldDepositorBtcPubkeyRef = useRef<string | undefined>(undefined);
  const heldVaultId =
    stickyVaultId !== null &&
    vaultIds.includes(stickyVaultId as Hex) &&
    (isActionable(stickyVaultId) || isUnresolved(stickyVaultId))
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

  // Clear the selection when all vaults wait. Select fresh when an action returns.
  useEffect(() => {
    setStickyVaultId(actionableVaultId);
  }, [actionableVaultId]);

  // A finished step must not stay held on a failing poll: release it so a
  // sibling's action can show, then refresh.
  const handleStepSuccess = useCallback(() => {
    setStickyVaultId(null);
    refetchRef.current();
  }, []);

  const pollingResult = currentVaultId
    ? getPollingResult(currentVaultId)
    : undefined;
  const liveActivity = currentVaultId
    ? activities.find((a) => a.id === currentVaultId)
    : undefined;
  const liveActions = pollingResult?.peginState.availableActions ?? [];
  // While the held vault's poll is unresolved, keep its last actions, and its
  // last activity and key for a tick that drops it, so the step stays mounted.
  const holdThrough = heldVaultId !== null && !isActionable(heldVaultId);
  if (!holdThrough) {
    heldActionsRef.current = liveActions;
    heldActivityRef.current = liveActivity;
    heldDepositorBtcPubkeyRef.current = pollingResult?.depositorBtcPubkey;
  }
  const actions = holdThrough ? heldActionsRef.current : liveActions;
  const activity = holdThrough
    ? (liveActivity ?? heldActivityRef.current)
    : liveActivity;
  const depositorBtcPubkey = holdThrough
    ? (pollingResult?.depositorBtcPubkey ?? heldDepositorBtcPubkeyRef.current)
    : pollingResult?.depositorBtcPubkey;

  // Hoisted above the early returns to satisfy Rules of Hooks. When no
  // vault is selected, showBtcDepthPanel is false and the hook no-ops.
  // requiredDepth pinned to the deposit's registered offchain-params version.
  const requiredDepth = useRequiredPrePeginDepth(
    activity?.offchainParamsVersion,
  );
  const peginState = pollingResult?.peginState;
  const waitStep = peginState
    ? (getPeginProgressStep(peginState) ?? DepositFlowStep.ACTIVATE_VAULT)
    : DepositFlowStep.AWAIT_BTC_CONFIRMATION;
  const showBtcDepthPanel =
    waitStep === DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS &&
    Boolean(activity?.prePeginTxHash);

  // Pass to every branch so split deposits render the stacked per-vault UI
  // with the current vault highlighted. A single-vault deposit yields
  // vaultCount=1 and the progress view falls back to its single-vault layout.
  // Cheap copy (not a readonly-laundering cast) so callers can't mutate the prop.
  // Memoized so it is a stable dependency of the activation callback below.
  const siblingVaultIds: string[] = useMemo(() => [...vaultIds], [vaultIds]);
  const vaultCount = siblingVaultIds.length || 1;

  if (!currentVaultId) {
    if (vaultIds.length === 0) {
      return (
        <StatusView
          currentStep={DepositFlowStep.COMPLETED}
          isComplete
          onClose={onClose}
          vaultCount={vaultCount}
          currentVaultIndex={null}
        />
      );
    }

    const pollingResults = vaultIds.map((id) => getPollingResult(id));
    const perVaultSteps = pollingResults.map((result) => {
      if (!result || result.loading) {
        return DepositFlowStep.AWAIT_BTC_CONFIRMATION;
      }
      const displayStep = getPeginProgressStep(result.peginState);
      if (displayStep !== null) return displayStep;
      if (
        result.peginState.displayVariant === "warning" ||
        result.peginState.displayVariant === "danger"
      ) {
        return getWarningPeginDisplayStep(result.peginState.localStatus);
      }
      return isVaultPastActivation(result.peginState)
        ? DepositFlowStep.COMPLETED
        : DepositFlowStep.AWAIT_BTC_CONFIRMATION;
    });
    const warning = pollingResults
      .map((result) => result?.peginState)
      .find(
        (state) =>
          state?.displayVariant === "warning" ||
          state?.displayVariant === "danger",
      );
    if (warning) {
      // Freeze the stepper at the point of failure based on the vault's
      // last persisted localStatus — `getPeginProgressStep` is null for
      // warning states by design, so we map it ourselves.
      const warningIndex = vaultIds.findIndex(
        (id) => getPollingResult(id)?.peginState === warning,
      );
      return (
        <StatusView
          currentStep={getWarningPeginDisplayStep(warning.localStatus)}
          error={mapDepositError(
            warning.message ?? COPY.common.somethingWentWrong.body,
          )}
          onClose={onClose}
          vaultCount={vaultCount}
          currentVaultIndex={warningIndex >= 0 ? warningIndex : null}
          perVaultSteps={perVaultSteps}
        />
      );
    }

    const hasMissingOrLoadingVault = pollingResults.some(
      (result) => !result || result.loading,
    );
    const states = pollingResults.map((result) => result?.peginState);
    const settled = !hasMissingOrLoadingVault && states.length > 0;
    // A vault whose activation landed without it joining the position is
    // past activation but never activated, so without this the batch would
    // park on the processing view below — for good once it reads REDEEMED.
    // One such vault decides the screen for the whole batch: the depositor
    // must not read "activated" while some of their BTC is on its way back.
    // Only receipt evidence counts — this session's mark or the outcome stored
    // with the deposit record: a sibling activated and later withdrawn also
    // reads REDEEMED, and is not being returned. The whole deposit is coming
    // back only when every vault was returned; otherwise the screen says only
    // part of it is, without claiming what became of the rest.
    const showReturned =
      settled &&
      states.some((state) => isVaultActivationReturned(state)) &&
      states.every((state) => isVaultPastActivation(state));
    if (showReturned) {
      const returnedIds = vaultIds.filter((_, index) =>
        isVaultActivationReturned(states[index]),
      );
      const returnedId = returnedIds.length === 1 ? returnedIds[0] : undefined;
      const sessionReason =
        returnedId === undefined
          ? undefined
          : activationReturnedReasons.get(returnedId);
      const storedReason =
        returnedId === undefined
          ? undefined
          : activities.find((a) => a.id === returnedId)?.redeemReason;
      // The session's receipt reading wins unless it settled on unknown; the
      // indexer's stored reason covers a reload, which re-marks with no reason.
      const returnedReason =
        sessionReason === undefined || sessionReason.kind === "unknown"
          ? (storedReason ?? sessionReason)
          : sessionReason;
      return (
        <VaultReturnedView
          variant={
            states.every((state) => isVaultActivationReturned(state))
              ? "full"
              : "partial"
          }
          reason={returnedReason}
          onGoToDashboard={handleGoToDashboard}
        />
      );
    }
    const allVaultsActivated =
      settled && states.every((state) => isVaultActivated(state));

    if (!allVaultsActivated) {
      // Batch siblings share their registration-time params version (one
      // registration tx for the whole batch), so any sibling is representative.
      const batchParamsVersion = activities.find(
        (a) => a.offchainParamsVersion !== undefined,
      )?.offchainParamsVersion;
      return (
        <StatusView
          currentStep={DepositFlowStep.AWAIT_BTC_CONFIRMATION}
          isProcessing
          canContinueInBackground
          onClose={onClose}
          vaultCount={vaultCount}
          currentVaultIndex={null}
          perVaultSteps={perVaultSteps}
          offchainParamsVersion={batchParamsVersion}
        />
      );
    }
    // Terminal success: show only the activated screen — one surface at a time,
    // so the deposit progress view is replaced rather than layered behind it.
    return <VaultActivatedView onGoToDashboard={handleGoToDashboard} />;
  }

  // God-mode: a demo vault renders a SAFE view — never the real Resume*Content,
  // which, once started (auto-start or its Start card), fires wallet signing /
  // vault-registry reads / on-chain submission. Activation is the one interactive simulated walk;
  // every other flow step is a read-only progress preview that tracks the
  // god-mode step slider live (moving the slider re-renders this at the new
  // step). Tree-shaken from production: demoVaultIds is empty and
  // DemoActivationContent is null there, so the whole block drops.
  if (
    import.meta.env.DEV &&
    activity &&
    currentVaultId &&
    demoVaultIds?.has(currentVaultId)
  ) {
    if (actions.includes(PeginAction.ACTIVATE_VAULT) && DemoActivationContent) {
      return (
        <ActivationGate
          key={`gate-${currentVaultId}`}
          activity={activity}
          onClose={onClose}
          simulatedProvider
        >
          <Suspense fallback={null}>
            <DemoActivationContent
              activity={activity}
              siblingVaultIds={siblingVaultIds}
              onClose={onClose}
            />
          </Suspense>
        </ActivationGate>
      );
    }
    const demoStep = pollingResult?.displayStepOverride ?? waitStep;
    const { perVaultSteps: demoPerVaultSteps } = deriveSplitVaultProgress(
      getPollingResult,
      siblingVaultIds,
      currentVaultId,
      demoStep,
    );
    return (
      <StatusView
        currentStep={demoStep}
        vaultCount={vaultCount}
        currentVaultIndex={currentVaultIndex >= 0 ? currentVaultIndex : null}
        perVaultSteps={demoPerVaultSteps}
        isProcessing
        canContinueInBackground
        onClose={onClose}
      />
    );
  }

  // Only one action can match. Broadcast precedes the vault provider steps.
  // ActivationGate requires a click before it downloads artifacts.

  if (activity && actions.includes(PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN)) {
    return (
      <ResumeBroadcastContent
        key={`broadcast-${currentVaultId}`}
        autoStart={autoStart(PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN)}
        activity={activity}
        batchVaultIds={siblingVaultIds}
        depositorEthAddress={depositorEthAddress}
        onClose={onClose}
        onSuccess={handleStepSuccess}
      />
    );
  }

  if (activity && actions.includes(PeginAction.SUBMIT_WOTS_KEY)) {
    return (
      <ResumeWotsContent
        key={`wots-${currentVaultId}`}
        autoStart={autoStart(PeginAction.SUBMIT_WOTS_KEY)}
        activity={activity}
        siblingVaultIds={siblingVaultIds}
        onClose={onClose}
        onSuccess={handleStepSuccess}
      />
    );
  }

  // The wait fallback must also require the on-chain depositor key.
  if (
    activity &&
    depositorBtcPubkey &&
    actions.includes(PeginAction.SIGN_PAYOUT_TRANSACTIONS)
  ) {
    return (
      <ResumeSignContent
        key={`payout-${currentVaultId}`}
        activity={activity}
        btcPublicKey={btcPublicKey}
        autoStart={autoStart(PeginAction.SIGN_PAYOUT_TRANSACTIONS)}
        depositorEthAddress={depositorEthAddress}
        siblingVaultIds={siblingVaultIds}
        onClose={onClose}
        onSuccess={handleStepSuccess}
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
          onGoToDashboard={handleGoToDashboard}
        />
      </ActivationGate>
    );
  }

  const btcConfirmationDetail: BtcConfirmationDetailData | null =
    showBtcDepthPanel && activity?.prePeginTxHash
      ? {
          prePeginTxid: activity.prePeginTxHash,
          requiredDepth,
          // Pass the whole batch — siblings share this broadcast, and the
          // container picks the first indexed sibling for coalesced counts.
          depositIds: vaultIds,
        }
      : null;

  // Each sibling lane reflects its own polled step (the lanes diverge on
  // resume), with this vault's wait step as the active lane.
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
      offchainParamsVersion={activity?.offchainParamsVersion}
    />
  );
}
