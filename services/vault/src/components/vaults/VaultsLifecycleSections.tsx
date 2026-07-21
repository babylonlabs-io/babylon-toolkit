/**
 * VaultsPendingSection — the v3 /vaults deposit-lifecycle lists (issue #2041).
 *
 * Owns two sections sharing one polling tree: "Pending Deposit" (one row per
 * in-flight deposit, with live step progress and the state's primary action)
 * and "Inactive Vaults" (one row per refundable-expired deposit — inactive is
 * the v3 name for expired — whose Withdraw action performs the HTLC refund).
 * Mounts its own ProtocolParamsProvider + PeginPollingProvider exactly like
 * the v2 PendingDepositSection — row state and CTAs derive from the polling
 * result, so god-mode demo rows work unchanged.
 */

import {
  FullScreenDialog,
  Heading,
  Hint,
  InfoIcon,
  Loader,
} from "@babylonlabs-io/core-ui";
import { useCallback, useState } from "react";
import type { Address, Hex } from "viem";

import { ApplicationLogo } from "@/components/ApplicationLogo";
import { getActionStatus } from "@/components/deposit/actionStatus";
import { CopyableHash } from "@/components/shared/CopyableHash";
import { ProgressBar } from "@/components/simple/DepositProgressView/ProgressBar";
import {
  getStepFillPercent,
  getVisualStep,
  TOTAL_VISUAL_STEPS,
} from "@/components/simple/DepositProgressView/steps";
import { PendingDepositModals } from "@/components/simple/PendingDepositModals";
import { PostDepositContinuationContent } from "@/components/simple/PostDepositContinuationContent";
import { ProtocolParamsProvider } from "@/context/ProtocolParamsContext";
import {
  PeginPollingProvider,
  useDepositPollingResult,
} from "@/context/deposit/PeginPollingContext";
import { COPY } from "@/copy";
import { getDemoStepperBatch } from "@/dev/demoDeposit";
import { usePendingDeposits } from "@/hooks/usePendingDeposits";
import {
  getPeginDisplayStep,
  isRefundInFlightOrSettled,
  PeginAction,
  type PeginState,
} from "@/models/peginStateMachine";
import type { VaultActivity } from "@/types/activity";
import type { VaultProvider } from "@/types/vaultProvider";
import { truncateHash } from "@/utils/addressUtils";
import { getBatchSiblings } from "@/utils/batchedPegin";
import { getBtcExplorerTxUrl } from "@/utils/explorer";

import {
  NEUTRAL_ROW_BUTTON_CLASS,
  PRIMARY_ROW_BUTTON_CLASS,
} from "./buttonClasses";

/** Step-progress bar fill — the pending amber, matching the status dot. */
const PROGRESS_FILL_COLOR = "rgb(var(--risk-amber))";

/** Dot color per display variant. Danger keeps the error red explicitly —
 *  there is no "no dot" state in this compact row layout (v2's cards swap in
 *  a warning icon instead). */
const DOT_CLASS: Record<PeginState["displayVariant"], string> = {
  pending: "bg-warning-main",
  active: "bg-success-main",
  inactive: "bg-accent-disabled",
  warning: "bg-error-main",
  danger: "bg-error-main",
};

function findProvider(
  vaultProviders: VaultProvider[],
  providerId: string | undefined,
): VaultProvider | undefined {
  if (!providerId) return undefined;
  return vaultProviders.find(
    (candidate) => candidate.id.toLowerCase() === providerId.toLowerCase(),
  );
}

function PendingRow({
  activity,
  vaultProviders,
  onOpenDetails,
  onBroadcast,
  onRefund,
}: {
  activity: VaultActivity;
  vaultProviders: VaultProvider[];
  onOpenDetails: (depositId: string) => void;
  onBroadcast: (depositId: string) => void;
  onRefund: (depositId: string) => void;
}) {
  // Undefined until the polling tree indexes this deposit — the row renders
  // its static cells with a loading status meanwhile.
  const result = useDepositPollingResult(activity.id);
  const provider = findProvider(vaultProviders, activity.providers[0]?.id);
  const providerName =
    provider?.name ?? truncateHash(activity.providers[0]?.id ?? "");

  const peginState = result?.peginState;
  const step =
    result && !result.loading
      ? (result.displayStepOverride ?? getPeginDisplayStep(result.peginState))
      : null;
  const fillPercent = step !== null ? getStepFillPercent(step) : null;

  const actionStatus: ReturnType<typeof getActionStatus> = result
    ? getActionStatus(result)
    : { type: "noAction" };
  const routeAction = (action: PeginAction) => {
    if (action === PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN) {
      onBroadcast(activity.id);
      return;
    }
    if (action === PeginAction.REFUND_HTLC) {
      onRefund(activity.id);
      return;
    }
    onOpenDetails(activity.id);
  };

  const hash = activity.prePeginTxHash ?? activity.peginTxHash;

  return (
    <div className="flex w-full items-center gap-4 rounded-lg border border-secondary-strokeLight p-4">
      {/* Amount + step position */}
      <div className="flex w-[180px] shrink-0 items-center gap-2">
        <ApplicationLogo
          logoUrl={provider?.iconUrl ?? null}
          name={providerName}
          size="small"
        />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-base leading-6 tracking-[0.15px] text-accent-primary">
            {activity.collateral.amount} {activity.collateral.symbol}
          </span>
          <span className="truncate text-xs leading-[1.66] tracking-[0.4px] text-accent-secondary">
            {step !== null
              ? COPY.deposit.progress.stepPrefix(
                  getVisualStep(step),
                  TOTAL_VISUAL_STEPS,
                )
              : (peginState?.inlineSubtext ?? "")}
          </span>
        </div>
      </div>

      {/* Status + progress */}
      <div className="flex w-[180px] shrink-0 flex-col gap-1">
        {peginState ? (
          <span className="flex items-center gap-1">
            <span
              className={`size-3 rounded-full ${DOT_CLASS[peginState.displayVariant]}`}
            />
            <span className="text-sm leading-[1.43] tracking-[0.17px] text-accent-primary">
              {peginState.displayLabel}
            </span>
            {peginState.message && (
              <Hint
                tooltip={peginState.message}
                icon={<InfoIcon size={16} className="text-accent-secondary" />}
              />
            )}
          </span>
        ) : (
          <Loader size={16} />
        )}
        {fillPercent !== null && (
          <span className="flex items-center gap-2 pl-4">
            <span className="w-[101px]">
              <ProgressBar percent={fillPercent} color={PROGRESS_FILL_COLOR} />
            </span>
            <span className="text-xs leading-[1.66] tracking-[0.4px] text-accent-primary">
              {COPY.vaults.progressPercent(Math.round(fillPercent * 100))}
            </span>
          </span>
        )}
      </div>

      {/* Provider */}
      <div className="flex w-[180px] shrink-0 items-center gap-2">
        <ApplicationLogo
          logoUrl={provider?.iconUrl ?? null}
          name={providerName}
          size="xs"
        />
        <span className="truncate text-sm leading-[1.43] tracking-[0.17px] text-accent-primary">
          {providerName}
        </span>
      </div>

      {/* Transaction hash */}
      <div className="flex min-w-0 flex-1 items-center [&_a]:underline">
        {hash && (
          <CopyableHash
            hash={hash}
            chain="BTC"
            explorerUrl={getBtcExplorerTxUrl(hash)}
          />
        )}
      </div>

      {/* Primary action or details */}
      {actionStatus.type === "available" ? (
        <button
          type="button"
          onClick={() => routeAction(actionStatus.action.action)}
          className={PRIMARY_ROW_BUTTON_CLASS}
        >
          {actionStatus.action.label}
        </button>
      ) : actionStatus.type === "disabled" ? (
        <Hint tooltip={actionStatus.tooltip} attachToChildren>
          <button type="button" disabled className={NEUTRAL_ROW_BUTTON_CLASS}>
            {actionStatus.action?.label ?? COPY.vaults.actions.viewDetails}
          </button>
        </Hint>
      ) : (
        <button
          type="button"
          onClick={() => onOpenDetails(activity.id)}
          className={NEUTRAL_ROW_BUTTON_CLASS}
        >
          {COPY.vaults.actions.viewDetails}
        </button>
      )}
    </div>
  );
}

function InactiveRow({
  activity,
  vaultProviders,
  onRefund,
}: {
  activity: VaultActivity;
  vaultProviders: VaultProvider[];
  onRefund: (depositId: string) => void;
}) {
  const result = useDepositPollingResult(activity.id);
  const provider = findProvider(vaultProviders, activity.providers[0]?.id);
  const providerName =
    provider?.name ?? truncateHash(activity.providers[0]?.id ?? "");

  const peginState = result?.peginState;
  const actionStatus: ReturnType<typeof getActionStatus> = result
    ? getActionStatus(result)
    : { type: "noAction" };
  // Product decision (#2041): the inactive vault's Withdraw performs the HTLC
  // refund. Only the refund action surfaces here — a refund already in flight
  // (or settled) leaves the row without an action.
  const isRefundAvailable =
    actionStatus.type === "available" &&
    actionStatus.action.action === PeginAction.REFUND_HTLC;
  const isRefundBlocked =
    actionStatus.type === "disabled" &&
    actionStatus.action?.action === PeginAction.REFUND_HTLC &&
    !(peginState ? isRefundInFlightOrSettled(peginState) : false);

  const hash = activity.prePeginTxHash ?? activity.peginTxHash;

  return (
    <div className="flex w-full items-center gap-4 rounded-lg border border-secondary-strokeLight bg-secondary-highlight p-4 dark:bg-[#202020]">
      {/* Amount + refund maturity */}
      <div className="flex w-[180px] shrink-0 items-center gap-2">
        <ApplicationLogo
          logoUrl={provider?.iconUrl ?? null}
          name={providerName}
          size="small"
        />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-base leading-6 tracking-[0.15px] text-accent-primary">
            {activity.collateral.amount} {activity.collateral.symbol}
          </span>
          <span className="truncate text-xs leading-[1.66] tracking-[0.4px] text-accent-secondary">
            {peginState?.inlineSubtext ?? ""}
          </span>
        </div>
      </div>

      {/* Status */}
      <div className="flex w-[180px] shrink-0 items-center">
        {peginState ? (
          <span className="flex items-center gap-1">
            <span
              className={`size-3 rounded-full ${DOT_CLASS[peginState.displayVariant]}`}
            />
            <span className="text-sm leading-[1.43] tracking-[0.17px] text-accent-primary">
              {peginState.displayLabel}
            </span>
            {peginState.message && (
              <Hint
                tooltip={peginState.message}
                icon={<InfoIcon size={16} className="text-accent-secondary" />}
              />
            )}
          </span>
        ) : (
          <Loader size={16} />
        )}
      </div>

      {/* Provider */}
      <div className="flex w-[180px] shrink-0 items-center gap-2">
        <ApplicationLogo
          logoUrl={provider?.iconUrl ?? null}
          name={providerName}
          size="xs"
        />
        <span className="truncate text-sm leading-[1.43] tracking-[0.17px] text-accent-primary">
          {providerName}
        </span>
      </div>

      {/* Transaction hash */}
      <div className="flex min-w-0 flex-1 items-center [&_a]:underline">
        {hash && (
          <CopyableHash
            hash={hash}
            chain="BTC"
            explorerUrl={getBtcExplorerTxUrl(hash)}
          />
        )}
      </div>

      {isRefundAvailable && (
        <button
          type="button"
          onClick={() => onRefund(activity.id)}
          className={PRIMARY_ROW_BUTTON_CLASS}
        >
          {COPY.vaults.actions.withdraw}
        </button>
      )}
      {actionStatus.type === "disabled" && isRefundBlocked && (
        <Hint tooltip={actionStatus.tooltip} attachToChildren>
          <button type="button" disabled className={NEUTRAL_ROW_BUTTON_CLASS}>
            {COPY.vaults.actions.withdraw}
          </button>
        </Hint>
      )}
    </div>
  );
}

export function VaultsPendingSection() {
  // Vault IDs whose multistepper view modal is open — the full batch for a
  // split pegin, null when closed (same contract as PendingDepositSection).
  const [viewingBatch, setViewingBatch] = useState<Hex[] | null>(null);

  const {
    pendingActivities,
    expiredActivities,
    allActivities,
    pendingPegins,
    vaultProviders,
    btcPublicKey,
    ethAddress,
    broadcastModal,
    refundModal,
    demo,
  } = usePendingDeposits();

  const rows = [...pendingActivities, ...expiredActivities];

  const handleOpenDetails = useCallback(
    (depositId: string) => {
      const activity = allActivities.find((a) => a.id === depositId);
      if (!activity) {
        // God-mode: an owned flow-state demo card opens the multistepper so
        // the whole flow can be walked. `import.meta.env.DEV` tree-shakes
        // this from production, where `demo` is always null.
        if (import.meta.env.DEV) {
          const demoBatch = getDemoStepperBatch(demo, depositId);
          if (demoBatch) setViewingBatch(demoBatch);
        }
        return;
      }
      const siblings = getBatchSiblings(allActivities, activity);
      setViewingBatch(siblings.map((s) => s.id as Hex));
    },
    [allActivities, demo],
  );

  // The broadcast/refund modals resolve ids against the REAL activity list, so
  // a demo row's action would silently no-op there — route demo ids to the
  // read-only stepper walk instead (matching v2's card-click behavior).
  const handleBroadcast = useCallback(
    (depositId: string) => {
      if (allActivities.some((a) => a.id === depositId)) {
        broadcastModal.handleBroadcastClick(depositId);
        return;
      }
      handleOpenDetails(depositId);
    },
    [allActivities, broadcastModal, handleOpenDetails],
  );
  const handleRefund = useCallback(
    (depositId: string) => {
      if (allActivities.some((a) => a.id === depositId)) {
        refundModal.handleRefundClick(depositId);
        return;
      }
      handleOpenDetails(depositId);
    },
    [allActivities, refundModal, handleOpenDetails],
  );

  const handleViewingClose = useCallback(() => setViewingBatch(null), []);

  // Keep the section (and its modals) mounted while a modal is open, even if
  // the last row advances to a terminal state mid-flow.
  const hasOpenModal = Boolean(
    broadcastModal.broadcastingActivity ||
      broadcastModal.successOpen ||
      refundModal.refundingActivity ||
      viewingBatch,
  );

  if (rows.length === 0 && !hasOpenModal) return null;

  return (
    <ProtocolParamsProvider>
      <PeginPollingProvider
        activities={allActivities}
        pendingPegins={pendingPegins}
        btcPublicKey={btcPublicKey}
      >
        {pendingActivities.length > 0 && (
          <section className="w-full space-y-2">
            <div className="flex items-center gap-3">
              <Heading
                variant="h6"
                as="h2"
                className="font-normal text-accent-primary"
              >
                {COPY.vaults.sections.pendingDepositsTitle}{" "}
                <span className="text-accent-secondary">
                  {COPY.vaults.sections.count(pendingActivities.length)}
                </span>
              </Heading>
              <div className="h-[18px] w-[18px] animate-spin rounded-full border-2 border-accent-primary border-t-transparent" />
            </div>
            <div className="space-y-2">
              {pendingActivities.map((activity) => (
                <PendingRow
                  key={activity.id}
                  activity={activity}
                  vaultProviders={vaultProviders}
                  onOpenDetails={handleOpenDetails}
                  onBroadcast={handleBroadcast}
                  onRefund={handleRefund}
                />
              ))}
            </div>
          </section>
        )}

        {expiredActivities.length > 0 && (
          <section className="w-full space-y-3">
            <Heading
              variant="h6"
              as="h2"
              className="font-normal text-accent-primary"
            >
              {COPY.vaults.sections.inactiveVaultsTitle}{" "}
              <span className="text-accent-secondary">
                {COPY.vaults.sections.count(expiredActivities.length)}
              </span>
            </Heading>
            <div className="space-y-2">
              {expiredActivities.map((activity) => (
                <InactiveRow
                  key={activity.id}
                  activity={activity}
                  vaultProviders={vaultProviders}
                  onRefund={handleRefund}
                />
              ))}
            </div>
          </section>
        )}

        <PendingDepositModals
          broadcastModal={broadcastModal}
          refundModal={refundModal}
          ethAddress={ethAddress}
        />

        {viewingBatch && ethAddress && (
          <FullScreenDialog
            open
            onClose={handleViewingClose}
            className="items-center justify-center p-6"
          >
            <div className="mx-auto w-full max-w-[520px]">
              <PostDepositContinuationContent
                vaultIds={viewingBatch}
                depositorEthAddress={ethAddress as Address}
                onClose={handleViewingClose}
              />
            </div>
          </FullScreenDialog>
        )}
      </PeginPollingProvider>
    </ProtocolParamsProvider>
  );
}
