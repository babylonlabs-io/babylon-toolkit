/**
 * VaultsLifecycleSections — the v3 /vaults deposit-lifecycle lists (#2041).
 *
 * Owns two sections sharing one polling tree: "Pending Deposit" (one row per
 * in-flight deposit, with live step progress and the state's primary action)
 * and "Inactive Vaults" (one row per refundable-expired deposit — inactive is
 * the v3 name for expired — whose Withdraw action performs the HTLC refund).
 * `children` (the Active Vaults section) renders between them, giving the
 * page's Pending → Active → Inactive order. Polling state comes from the app's
 * single AppPeginPollingProvider (mounted in RootLayout); this component mounts
 * only the ProtocolParamsProvider its own children need — row state and CTAs
 * derive from the polling result, so god-mode demo rows work
 * unchanged. `deposits` arrives from the page's single `usePendingDeposits`
 * call (shared with the emptiness hook) so the broadcast/refund modal state
 * is instantiated once.
 */

import { Heading, Hint, InfoIcon, Loader } from "@babylonlabs-io/core-ui";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import type { Address, Hex } from "viem";

import { ApplicationLogo } from "@/components/ApplicationLogo";
import { getActionStatus } from "@/components/deposit/actionStatus";
import { CopyableHash } from "@/components/shared/CopyableHash";
import {
  LIST_ROW_ACTION_SLOT_CLASS,
  LIST_ROW_COLUMN_CLASS,
  LIST_ROW_LEADING_COLUMN_CLASS,
  LIST_ROW_MIN_HEIGHT_CLASS,
  LIST_ROW_STATUS_COLUMN_CLASS,
  ListRowCard,
} from "@/components/shared/ListRow";
import { V3ModalShell } from "@/components/shared/V3ModalShell";
import {
  NEUTRAL_ROW_BUTTON_CLASS,
  PRIMARY_ROW_BUTTON_CLASS,
} from "@/components/shared/buttonClasses";
import { ProgressBar } from "@/components/simple/DepositProgressView/ProgressBar";
import {
  getStepFillPercent,
  getVisualStep,
  TOTAL_VISUAL_STEPS,
} from "@/components/simple/DepositProgressView/steps";
import { PendingDepositModals } from "@/components/simple/PendingDepositModals";
import { PostDepositContinuationContent } from "@/components/simple/PostDepositContinuationContent";
import { ProtocolParamsProvider } from "@/context/ProtocolParamsContext";
import { useDepositPollingResult } from "@/context/deposit/PeginPollingContext";
import { COPY } from "@/copy";
import { useReclaimRowAction } from "@/hooks/deposit/useReclaimRowAction";
import { useRefundRowAction } from "@/hooks/deposit/useRefundRowAction";
import type { usePendingDeposits } from "@/hooks/usePendingDeposits";
import { useReclaimStatus, type ReclaimStatus } from "@/hooks/useReclaimStatus";
import { useReclaimVaultChainData } from "@/hooks/useReclaimVaultChainData";
import {
  canPerformAction,
  getPeginDisplayStep,
  PeginAction,
  type PeginState,
} from "@/models/peginStateMachine";
import { getDemoStepperBatch } from "@/overrides/deposits";
import type { VaultActivity } from "@/types/activity";
import type { VaultProvider } from "@/types/vaultProvider";
import { truncateHash } from "@/utils/addressUtils";
import { getBatchSiblings } from "@/utils/batchedPegin";
import { getBtcExplorerTxUrl } from "@/utils/explorer";
import { formatSats } from "@/utils/formatting";

/** Step-progress bar fill — the pending amber, matching the status dot. */
const PROGRESS_FILL_COLOR = "rgb(var(--risk-amber))";

/**
 * Real-wallet E2E hook for the reclaim action (e2e/real/actions/reclaim.ts).
 * Shared by the enabled and in-flight renders so the harness finds the control
 * in either state — carry it over if you move or rename the element.
 */
const RECLAIM_BUTTON_TEST_ID = "vault-reclaim-button";

/**
 * Reserve-figure cell width. Sits outside the fixed action slot, whose basis is
 * what keeps every row's columns aligned, so it needs a width of its own; 82px
 * is the design's, and fits "999,999 sats" at `text-sm`.
 */
const RECLAIM_METRIC_COLUMN_CLASS = "w-[82px]";

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

/**
 * Explorer link for a lifecycle row's hash, matching v2's PendingDepositCard
 * `linkPrePegin` gate: the Pre-PegIn tx is on Bitcoin only once the depositor
 * has broadcast it — before that (and while the polling result is still
 * loading) a link would 404, so the hash stays copy-only. A peg-in hash
 * surfacing here is never linked; the vault provider broadcasts that tx only
 * at activation, which is past both lifecycle sections.
 */
function getRowExplorerUrl(
  activity: VaultActivity,
  peginState: PeginState | undefined,
): string | undefined {
  if (!activity.prePeginTxHash || !peginState) return undefined;
  if (canPerformAction(peginState, PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN)) {
    return undefined;
  }
  return getBtcExplorerTxUrl(activity.prePeginTxHash);
}

function PendingRow({
  activity,
  vaultProviders,
  onOpenDetails,
  onBroadcast,
  onRefund,
  onEmergencyWithdraw,
}: {
  activity: VaultActivity;
  vaultProviders: VaultProvider[];
  onOpenDetails: (depositId: string) => void;
  onBroadcast: (depositId: string) => void;
  onRefund: (depositId: string) => void;
  onEmergencyWithdraw: (depositId: string) => void;
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
    if (action === PeginAction.ACTIVATE_AND_REDEEM) {
      onEmergencyWithdraw(activity.id);
      return;
    }
    onOpenDetails(activity.id);
  };

  // Pre-PegIn first: while a deposit is in flight the Pre-PegIn tx exists
  // before the peg-in tx does (active rows prefer the opposite).
  const hash = activity.prePeginTxHash ?? activity.peginTxHash;

  return (
    // This row's data-testid is a real-wallet E2E hook
    // (e2e/real/actions/resume.ts) — carry it over if you move or rename the
    // element. The harness scopes a --txid resume to one row through it.
    <div
      data-testid="pending-deposit-row"
      className={`${LIST_ROW_MIN_HEIGHT_CLASS} flex w-full flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border border-secondary-strokeLight p-4`}
    >
      {/* Amount + step position */}
      <div
        className={`flex items-center gap-2 ${LIST_ROW_LEADING_COLUMN_CLASS}`}
      >
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
            {/* Subtext wins when a state sets one: it is state-specific
                (e.g. an activation-window countdown) and therefore more
                informative than the generic step position. States that set it
                and still have a step are exactly the ones that need it. */}
            {peginState?.inlineSubtext
              ? peginState.inlineSubtext
              : step !== null
                ? COPY.deposit.progress.stepPrefix(
                    getVisualStep(step),
                    TOTAL_VISUAL_STEPS,
                  )
                : ""}
          </span>
        </div>
      </div>

      {/* Status + progress */}
      <div className={`flex flex-col gap-1 ${LIST_ROW_STATUS_COLUMN_CLASS}`}>
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
      <div className={`flex items-center gap-2 ${LIST_ROW_COLUMN_CLASS}`}>
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
      <div
        className={`flex items-center [&_a]:underline ${LIST_ROW_COLUMN_CLASS}`}
      >
        {hash && (
          <CopyableHash
            hash={hash}
            chain="BTC"
            explorerUrl={getRowExplorerUrl(activity, peginState)}
          />
        )}
      </div>

      {/* Primary action or details. Pending labels are the widest the rows
          produce ("Broadcast Pre-Pegin"), which is what the slot's fixed basis
          is sized to — routing them through it keeps this row's columns level
          with the Active and Inactive rows. */}
      <div className={LIST_ROW_ACTION_SLOT_CLASS}>
        {actionStatus.type === "available" ? (
          // This control's data-testid is a real-wallet E2E hook
          // (e2e/real/actions/resume.ts) — carry it over if you move or rename
          // the element. It replaces the v2 pending-deposit card's resume CTA.
          <button
            type="button"
            onClick={() => routeAction(actionStatus.action.action)}
            className={PRIMARY_ROW_BUTTON_CLASS}
            data-testid="pending-deposit-resume-cta"
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
    </div>
  );
}

function InactiveRow({
  activity,
  vaultProviders,
  onRefund,
  onReclaim,
  reclaimStatus,
  reclaimOnChainStatus,
  isReclaimInFlight,
}: {
  activity: VaultActivity;
  vaultProviders: VaultProvider[];
  onRefund: (depositId: string) => void;
  onReclaim: (depositId: string) => void;
  /** Reserve state from the section's batched poll; undefined for expired rows. */
  reclaimStatus: ReclaimStatus | undefined;
  reclaimOnChainStatus: number | undefined;
  isReclaimInFlight: boolean;
}) {
  const result = useDepositPollingResult(activity.id);
  const provider = findProvider(vaultProviders, activity.providers[0]?.id);
  const providerName =
    provider?.name ?? truncateHash(activity.providers[0]?.id ?? "");

  const peginState = result?.peginState;
  // Product decision (#2041): the inactive vault's Withdraw performs the HTLC
  // refund, on the same terms the Activity feed's expired row offers it.
  const { available: isRefundAvailable, blockedTooltip } = useRefundRowAction(
    activity.id,
  );
  // Refund and reclaim are mutually exclusive by contract status — refund
  // applies to EXPIRED vaults (no PegIn was ever broadcast), reclaim to
  // DEPOSITOR_WITHDRAWN ones (the PegIn confirmed and the peg-out settled). A
  // row therefore never carries both actions.
  const {
    available: isReclaimAvailable,
    reclaiming: isReclaiming,
    blockedTooltip: reclaimBlockedTooltip,
    reclaimableSats,
  } = useReclaimRowAction({
    status: reclaimStatus,
    onChainStatus: reclaimOnChainStatus,
    depositorBtcPubkey: activity.depositorBtcPubkey,
    isReclaimInFlight,
  });

  // While a sweep is in flight the status cell reports the reserve action
  // rather than the vault's own lifecycle state, the same way the refund path
  // shows "Refunding" over an expired vault's label. It reverts to the vault's
  // own label ("Redeemed") once the sweep confirms.
  const statusLabel = isReclaiming
    ? COPY.reclaim.rowStatusReclaiming
    : peginState?.displayLabel;

  // Pre-PegIn first: an expired deposit never activated, so the Pre-PegIn tx
  // is the one that exists (active rows prefer the opposite).
  const hash = activity.prePeginTxHash ?? activity.peginTxHash;

  return (
    <ListRowCard className={LIST_ROW_MIN_HEIGHT_CLASS}>
      {/* Amount + refund maturity */}
      <div
        className={`flex items-center gap-2 ${LIST_ROW_LEADING_COLUMN_CLASS}`}
      >
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
      <div className={`flex items-center ${LIST_ROW_COLUMN_CLASS}`}>
        {peginState ? (
          <span className="flex items-center gap-1">
            <span
              className={`size-3 rounded-full ${DOT_CLASS[peginState.displayVariant]}`}
            />
            <span className="text-sm leading-[1.43] tracking-[0.17px] text-accent-primary">
              {statusLabel}
            </span>
            {/* The vault's own hint describes its lifecycle state, which is not
                what the cell is reporting while a sweep is in flight. */}
            {!isReclaiming && peginState.message && (
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
      <div className={`flex items-center gap-2 ${LIST_ROW_COLUMN_CLASS}`}>
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
      <div
        className={`flex items-center [&_a]:underline ${LIST_ROW_COLUMN_CLASS}`}
      >
        {hash && (
          <CopyableHash
            hash={hash}
            chain="BTC"
            explorerUrl={getRowExplorerUrl(activity, peginState)}
          />
        )}
      </div>

      {/* Reclaimable reserve figure, sitting left of the action slot rather
          than inside it: the slot's fixed basis is what keeps every row's
          columns aligned, and the design's amount + button pair is wider than
          that basis. Rendered on every inactive row — empty for refund rows —
          so both row kinds still line up. */}
      <div className={`flex shrink-0 flex-col ${RECLAIM_METRIC_COLUMN_CLASS}`}>
        {reclaimableSats !== null && (
          <>
            <span className="text-sm leading-[1.43] tracking-[0.17px] text-accent-primary">
              {COPY.reclaim.rowAmount(formatSats(reclaimableSats))}
            </span>
            <span className="text-xs leading-[1.4] tracking-[0.4px] text-accent-secondary">
              {COPY.reclaim.rowMetricLabel}
            </span>
          </>
        )}
      </div>

      {/* Reserved even when neither action is available nor blocked, so an
          actionless row still aligns with the rows that carry a button. */}
      <div className={LIST_ROW_ACTION_SLOT_CLASS}>
        {isRefundAvailable && (
          <button
            type="button"
            onClick={() => onRefund(activity.id)}
            className={PRIMARY_ROW_BUTTON_CLASS}
          >
            {COPY.vaults.actions.withdraw}
          </button>
        )}
        {blockedTooltip && (
          <Hint tooltip={blockedTooltip} attachToChildren>
            <button type="button" disabled className={NEUTRAL_ROW_BUTTON_CLASS}>
              {COPY.vaults.actions.withdraw}
            </button>
          </Hint>
        )}
        {isReclaimAvailable && (
          // This control's data-testid is a real-wallet E2E hook
          // (e2e/real/actions/reclaim.ts) — carry it over if you move or
          // rename the element.
          <button
            type="button"
            onClick={() => onReclaim(activity.id)}
            className={NEUTRAL_ROW_BUTTON_CLASS}
            data-testid={RECLAIM_BUTTON_TEST_ID}
          >
            {COPY.reclaim.rowButton}
          </button>
        )}
        {/* Sweep broadcast, awaiting confirmation. The button stays in place
            but disabled — re-opening the modal would only reach the
            "already reclaimed" screen. The status cell carries the "why". */}
        {isReclaiming && (
          <button
            type="button"
            disabled
            className={NEUTRAL_ROW_BUTTON_CLASS}
            data-testid={RECLAIM_BUTTON_TEST_ID}
          >
            {COPY.reclaim.rowButton}
          </button>
        )}
        {reclaimBlockedTooltip && (
          <Hint tooltip={reclaimBlockedTooltip} attachToChildren>
            <button type="button" disabled className={NEUTRAL_ROW_BUTTON_CLASS}>
              {COPY.reclaim.rowButton}
            </button>
          </Hint>
        )}
      </div>
    </ListRowCard>
  );
}

export function VaultsLifecycleSections({
  deposits,
  children,
}: {
  /** The page's single `usePendingDeposits` result, shared with the emptiness hook. */
  deposits: ReturnType<typeof usePendingDeposits>;
  children?: ReactNode;
}) {
  // Vault IDs whose multistepper view modal is open — the full batch for a
  // split pegin, null when closed (same contract as PendingDepositSection).
  const [viewingBatch, setViewingBatch] = useState<Hex[] | null>(null);

  const {
    pendingActivities,
    expiredActivities,
    reclaimableCandidates,
    allActivities,
    vaultProviders,
    ethAddress,
    broadcastModal,
    refundModal,
    reclaimModal,
    emergencyWithdrawModal,
    demo,
  } = deposits;

  // Contract reads for the settled candidates: the authoritative PegIn txid and
  // the live on-chain status. Cached long — a settled vault's row is immutable.
  const candidateVaultIds = useMemo(
    () => reclaimableCandidates.map((a) => a.id),
    [reclaimableCandidates],
  );
  const reclaimChainData = useReclaimVaultChainData(candidateVaultIds);

  // Bitcoin poll, one batch for the whole section. Only vaults whose contract
  // read landed are probed — without it the gate fails closed anyway.
  const reclaimOutpoints = useMemo(
    () =>
      reclaimableCandidates
        .map((activity) => {
          const chain = reclaimChainData.get(activity.id.toLowerCase());
          return chain
            ? { depositId: activity.id as string, peginTxid: chain.peginTxid }
            : null;
        })
        .filter(
          (o): o is { depositId: string; peginTxid: string } => o !== null,
        ),
    [reclaimableCandidates, reclaimChainData],
  );
  const { statusByDepositId } = useReclaimStatus(reclaimOutpoints);

  // Settled vaults join the expired ones in the Inactive section rather than
  // getting a section of their own, so the heading count and action-required
  // label pick them up unchanged.
  const inactiveActivities: VaultActivity[] = useMemo(
    () => [...expiredActivities, ...reclaimableCandidates],
    [expiredActivities, reclaimableCandidates],
  );

  const rows = [...pendingActivities, ...inactiveActivities];

  const handleOpenDetails = useCallback(
    (depositId: string) => {
      const activity = allActivities.find((a) => a.id === depositId);
      if (!activity) {
        // God-mode: an owned flow-state demo card opens the multistepper so
        // the whole flow can be walked. `getDemoStepperBatch` is null-safe
        // and gated at source, so this is a no-op in production.
        const demoBatch = getDemoStepperBatch(demo, depositId);
        if (demoBatch) setViewingBatch(demoBatch);
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
  const handleReclaim = useCallback(
    (depositId: string) => {
      if (allActivities.some((a) => a.id === depositId)) {
        reclaimModal.handleReclaimClick(depositId);
        return;
      }
      handleOpenDetails(depositId);
    },
    [allActivities, reclaimModal, handleOpenDetails],
  );
  const handleEmergencyWithdraw = useCallback(
    (depositId: string) => {
      if (allActivities.some((a) => a.id === depositId)) {
        emergencyWithdrawModal.handleWithdrawClick(depositId, "detected");
        return;
      }
      handleOpenDetails(depositId);
    },
    [allActivities, emergencyWithdrawModal, handleOpenDetails],
  );
  // Advanced entry from the activation dialog inside the multistepper: swap
  // the multistepper for the dedicated withdraw modal (the two never stack).
  const handleAdvancedWithdraw = useCallback(
    (depositId: string) => {
      setViewingBatch(null);
      emergencyWithdrawModal.handleWithdrawClick(depositId, "advanced");
    },
    [emergencyWithdrawModal],
  );

  const handleViewingClose = useCallback(() => setViewingBatch(null), []);

  // Keep the section (and its modals) mounted while a modal is open, even if
  // the last row advances to a terminal state mid-flow.
  const hasOpenModal = Boolean(
    broadcastModal.broadcastingActivity ||
      broadcastModal.successOpen ||
      refundModal.refundingActivity ||
      reclaimModal.reclaimingActivity ||
      emergencyWithdrawModal.withdrawing ||
      viewingBatch,
  );

  // No lifecycle rows and nothing modal-held: skip the providers entirely but
  // keep the Active Vaults section (children) rendering.
  if (rows.length === 0 && !hasOpenModal) return <>{children}</>;

  return (
    <ProtocolParamsProvider>
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
            <Loader size={16} className="text-accent-primary" />
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
                onEmergencyWithdraw={handleEmergencyWithdraw}
              />
            ))}
          </div>
        </section>
      )}

      {children}

      {inactiveActivities.length > 0 && (
        <section className="w-full space-y-3">
          <Heading
            variant="h6"
            as="h2"
            className="font-normal text-accent-primary"
          >
            {COPY.vaults.sections.inactiveVaultsTitle}{" "}
            <span className="text-accent-secondary">
              {COPY.vaults.sections.count(inactiveActivities.length)}
            </span>
          </Heading>
          <div className="space-y-2">
            {inactiveActivities.map((activity) => (
              <InactiveRow
                key={activity.id}
                activity={activity}
                vaultProviders={vaultProviders}
                onRefund={handleRefund}
                onReclaim={handleReclaim}
                reclaimStatus={statusByDepositId.get(activity.id.toLowerCase())}
                reclaimOnChainStatus={
                  reclaimChainData.get(activity.id.toLowerCase())?.onChainStatus
                }
                isReclaimInFlight={reclaimModal.inFlightVaultIds.has(
                  activity.id.toLowerCase(),
                )}
              />
            ))}
          </div>
        </section>
      )}

      <PendingDepositModals
        broadcastModal={broadcastModal}
        refundModal={refundModal}
        reclaimModal={reclaimModal}
        emergencyWithdrawModal={emergencyWithdrawModal}
        ethAddress={ethAddress}
      />

      {viewingBatch && ethAddress && (
        <V3ModalShell open onClose={handleViewingClose}>
          <div className="mx-auto w-full max-w-[520px]">
            <PostDepositContinuationContent
              vaultIds={viewingBatch}
              depositorEthAddress={ethAddress as Address}
              onClose={handleViewingClose}
              onAdvancedWithdraw={handleAdvancedWithdraw}
            />
          </div>
        </V3ModalShell>
      )}
    </ProtocolParamsProvider>
  );
}
