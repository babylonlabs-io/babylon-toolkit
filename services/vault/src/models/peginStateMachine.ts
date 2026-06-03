/**
 * Peg-In State Machine — frontend display layer on top of SDK protocol state.
 *
 * Protocol-level state logic lives in @babylonlabs-io/ts-sdk.
 * This module adds display labels, messages, variants, and vault-specific
 * concerns (isInUse, vpTerminalError, localStorage compat).
 */

import { PRE_DEPOSITOR_SIGNATURES_STATES } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import {
  ContractStatus,
  PeginAction as SdkPeginAction,
  getPeginProtocolState,
  type ExpirationReason,
} from "@babylonlabs-io/ts-sdk/tbv/core/services";

import { BTC_BLOCK_TIME_MINS, MINS_PER_HOUR } from "@/constants";
import { COPY } from "@/copy";
import { DepositFlowStep } from "@/hooks/deposit/depositFlowSteps/types";

export { ContractStatus } from "@babylonlabs-io/ts-sdk/tbv/core/services";
export type {
  ExpirationReason,
  GetPeginProtocolStateOptions,
  PeginProtocolState,
} from "@babylonlabs-io/ts-sdk/tbv/core/services";

// ============================================================================
// Off-chain tracking — client-side state, not protocol logic
// ============================================================================

export enum OffChainTrackingStatus {
  PENDING = "pending",
  PAYOUT_SIGNED = "payout_signed",
  CONFIRMING = "confirming",
  CONFIRMED = "confirmed",
  REFUND_BROADCAST = "refund_broadcast",
}

export const LocalStorageStatus = OffChainTrackingStatus;
export type LocalStorageStatus = OffChainTrackingStatus;

/**
 * Check if an error indicates the vault provider is still processing
 * (before PendingDepositorSignatures state).
 */
export function isPreDepositorSignaturesError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message;

  return (
    msg.includes("Invalid state") &&
    PRE_DEPOSITOR_SIGNATURES_STATES.some((state) => msg.includes(state))
  );
}

export enum PeginAction {
  SUBMIT_WOTS_KEY = "SUBMIT_WOTS_KEY",
  SIGN_PAYOUT_TRANSACTIONS = "SIGN_PAYOUT_TRANSACTIONS",
  SIGN_AND_BROADCAST_TO_BITCOIN = "SIGN_AND_BROADCAST_TO_BITCOIN",
  ACTIVATE_VAULT = "ACTIVATE_VAULT",
  REFUND_HTLC = "REFUND_HTLC",
  NONE = "NONE",
}

// ============================================================================
// Display labels & types
// ============================================================================

export const PEGIN_DISPLAY_LABELS = COPY.pegin.labels;

export type PeginDisplayLabel =
  (typeof PEGIN_DISPLAY_LABELS)[keyof typeof PEGIN_DISPLAY_LABELS];

// ============================================================================
// Unified PeginState (frontend)
// ============================================================================

/**
 * Refund availability for an EXPIRED vault.
 *
 * The HTLC refund leaf is gated by `OP_CSV` over the deposit's pinned
 * `tRefund` (blocks since Pre-PegIn confirmation). Bitcoin rejects an
 * early broadcast with `non-BIP68-final`, so the UI surfaces three
 * distinct states instead of unconditionally offering the action.
 *
 * - `mature`   — CSV satisfied; refund broadcast will be accepted.
 * - `maturing` — CSV not yet satisfied; the countdown is known.
 * - `unknown`  — confirmation count or per-deposit `tRefund` not
 *                resolvable; the UI shows a generic pending message and
 *                does NOT mark mature (never false-positive).
 */
export type RefundMaturityState = "mature" | "maturing" | "unknown";

export interface PeginState {
  contractStatus: ContractStatus;
  localStatus?: LocalStorageStatus;
  displayLabel: PeginDisplayLabel;
  displayVariant: "pending" | "active" | "inactive" | "warning";
  availableActions: PeginAction[];
  message?: string;
  awaitingPayoutPrep?: boolean;
  refundMaturityState?: RefundMaturityState;
  /** Blocks remaining until refund matures; set only when `maturing`. */
  refundMaturesInBlocks?: number;
  /**
   * Short message intended for the inline subtext slot under the amount
   * (e.g. "Refund claimable in ~18 blocks (~3h)"). The full sentence stays
   * in `message` for the tooltip. Set for maturing / unknown EXPIRED only.
   */
  inlineSubtext?: string;
}

export interface GetPeginStateOptions {
  localStatus?: LocalStorageStatus;
  transactionsReady?: boolean;
  isInUse?: boolean;
  needsWotsKey?: boolean;
  pendingIngestion?: boolean;
  /**
   * True when the Pre-PegIn BTC tx has reached the protocol-mandated
   * confirmation depth on mempool (chain ground truth). Lets the state
   * machine distinguish "BTC depth still pending" from "BTC done, VP
   * stuck at PendingIngestion" — those two collapse into the same UI
   * if we rely on localStorage `CONFIRMING` alone.
   */
  prePeginBroadcastConfirmed?: boolean;
  /**
   * True when the Pre-PegIn BTC tx is present on the network at all (in the
   * mempool or a block — chain ground truth, independent of localStorage and
   * of confirmation depth). Once seen, the broadcast action is moot in EVERY
   * tab/device, so the dashboard stops re-offering "Broadcast" in a tab that
   * happens to lack the local `CONFIRMING` marker. A superset of
   * `prePeginBroadcastConfirmed` (confirmed ⇒ seen).
   */
  prePeginBroadcastSeen?: boolean;
  expirationReason?: ExpirationReason;
  expiredAt?: number;
  /**
   * True only when the deposit can be refunded *now*: the Pre-PegIn tx
   * exists AND the HTLC CSV timelock (`tRefund`) has elapsed. The
   * frontend computes this composite — the SDK-level protocol state
   * isn't aware of Bitcoin maturity.
   */
  canRefund?: boolean;
  /**
   * Per-deposit refund maturity (see {@link RefundMaturityState}). Drives
   * the EXPIRED-branch message (countdown / pending / mature) without
   * changing the action gating, which is owned by `canRefund`.
   */
  refundMaturityState?: RefundMaturityState;
  /** Blocks remaining until CSV maturity; set only when `maturing`. */
  refundMaturesInBlocks?: number;
  vpTerminalError?: string;
  /**
   * `Date.now()` value captured when the refund tx was broadcast. Anchors
   * the TTL on the REFUND_BROADCAST optimistic suppression so a tx evicted
   * from the mempool eventually re-exposes the refund action.
   */
  refundBroadcastAt?: number;
  /** Override `Date.now()` used for the TTL check (testing only). */
  now?: number;
}

/**
 * How long to keep suppressing the refund action after a broadcast while the
 * contract is still EXPIRED. Long enough to cover the realistic confirmation
 * window with margin; short enough that a dropped/evicted tx unblocks retry
 * before the user has to clear localStorage by hand.
 */
const REFUND_BROADCAST_SUPPRESSION_MS = 6 * 60 * 60 * 1000;

// ============================================================================
// Expiration helpers
// ============================================================================

const EXPIRATION_REASON_LABELS: Record<ExpirationReason, string> =
  COPY.pegin.expiration.reasons;

function formatExpiredTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 0) return COPY.pegin.expiration.timeAgo.justNow;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return COPY.pegin.expiration.timeAgo.justNow;
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function buildExpiredMessage(
  expirationReason?: ExpirationReason,
  expiredAt?: number,
): string {
  const reason = expirationReason
    ? EXPIRATION_REASON_LABELS[expirationReason]
    : undefined;
  const parts = [
    COPY.pegin.expiration.heading,
    reason ? `${reason}.` : null,
    expiredAt
      ? `${COPY.pegin.expiration.timeAgo.prefix} ${formatExpiredTimeAgo(expiredAt)}.`
      : null,
  ].filter(Boolean);
  return parts.join(" ");
}

/**
 * Check if a specific action is available in the current state
 */
export function canPerformAction(
  state: PeginState,
  action: PeginAction,
): boolean {
  return state.availableActions.includes(action);
}

/**
 * PegIn actions a depositor can drive inline from the deposit flow.
 *
 * Excludes:
 *  - `NONE` — sentinel for "no action."
 *  - `SIGN_AND_BROADCAST_TO_BITCOIN` — the shared Pre-PegIn broadcast. It's a
 *    single step every batch sibling shares, not a per-vault divergent one, so
 *    it doesn't belong in the "which sibling needs attention" set. The
 *    post-deposit continuation does drive broadcast (via its own branch +
 *    a local actionable check), but selection there never needs to prefer one
 *    sibling over another for it.
 *  - `REFUND_HTLC` — a terminal escape hatch, not an in-flow next step.
 */
export const USER_ACTIONABLE_PEGIN_ACTIONS: ReadonlySet<PeginAction> = new Set([
  PeginAction.SUBMIT_WOTS_KEY,
  PeginAction.SIGN_PAYOUT_TRANSACTIONS,
  PeginAction.ACTIVATE_VAULT,
]);

// ============================================================================
// getPeginState — frontend display layer on top of SDK protocol state
// ============================================================================

const SDK_TO_VAULT_ACTION: Record<string, PeginAction> = {
  [SdkPeginAction.SUBMIT_WOTS_KEY]: PeginAction.SUBMIT_WOTS_KEY,
  [SdkPeginAction.SIGN_PAYOUT_TRANSACTIONS]:
    PeginAction.SIGN_PAYOUT_TRANSACTIONS,
  [SdkPeginAction.SIGN_AND_BROADCAST_TO_BITCOIN]:
    PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN,
  [SdkPeginAction.ACTIVATE_VAULT]: PeginAction.ACTIVATE_VAULT,
  [SdkPeginAction.REFUND_HTLC]: PeginAction.REFUND_HTLC,
};

function mapActions(sdkActions: SdkPeginAction[]): PeginAction[] {
  if (sdkActions.length === 0) return [PeginAction.NONE];
  return sdkActions.map((a) => {
    const mapped = SDK_TO_VAULT_ACTION[a];
    if (!mapped) {
      throw new Error(`Unknown SDK PeginAction: ${a}`);
    }
    return mapped;
  });
}

export function getPeginState(
  contractStatus: ContractStatus,
  options: GetPeginStateOptions = {},
): PeginState {
  const protocolState = getPeginProtocolState(contractStatus, {
    transactionsReady: options.transactionsReady,
    needsWotsKey: options.needsWotsKey,
    pendingIngestion: options.pendingIngestion,
    canRefund: options.canRefund,
    hasProviderTerminalFailure: !!options.vpTerminalError,
  });

  const sdkActions = applyTrackingOverrides(
    protocolState.availableActions,
    contractStatus,
    options.localStatus,
    {
      needsWotsKey: options.needsWotsKey,
      transactionsReady: options.transactionsReady,
      pendingIngestion: options.pendingIngestion,
    },
    options.refundBroadcastAt,
    options.now,
  );
  // Chain ground truth overrides the localStorage-gated broadcast action:
  // once the Pre-PegIn is on the network at all (seen in mempool/chain) there
  // is nothing left to broadcast, so we drop the action in EVERY tab/device —
  // not just the one holding the local CONFIRMING marker. A confirmed-at-depth
  // deposit then surfaces as "ingesting" and a seen-but-shallow one as
  // "awaiting Bitcoin confirmation", instead of a phantom "broadcast may have
  // failed" prompt. (`prePeginBroadcastConfirmed ⊆ prePeginBroadcastSeen`; both
  // are checked so a caller that sets only the former still suppresses.)
  const chainAdjustedActions =
    options.prePeginBroadcastSeen === true ||
    options.prePeginBroadcastConfirmed === true
      ? sdkActions.filter(
          (a) => a !== SdkPeginAction.SIGN_AND_BROADCAST_TO_BITCOIN,
        )
      : sdkActions;
  const actions = mapActions(chainAdjustedActions);
  const display = getDisplay(contractStatus, actions, options);

  return {
    contractStatus,
    localStatus: options.localStatus,
    availableActions: actions,
    ...display,
  };
}

/**
 * VP-derived signals used to reconcile localStorage status.
 *
 * When localStorage claims the user has completed a step but VP daemon
 * state contradicts that claim, the override is ignored. This prevents
 * tampered or stale localStorage from hiding the correct action buttons.
 */
interface VpReconciliationState {
  needsWotsKey?: boolean;
  transactionsReady?: boolean;
  pendingIngestion?: boolean;
}

/**
 * Suppress protocol actions when the user has already acted (tracked in
 * localStorage) but the on-chain state hasn't caught up yet.
 *
 * VP state is cross-checked to detect stale or tampered localStorage:
 * if the VP daemon contradicts the claimed local status, the override
 * is ignored and the full SDK action set is returned.
 */
function applyTrackingOverrides(
  sdkActions: SdkPeginAction[],
  contractStatus: ContractStatus,
  localStatus?: LocalStorageStatus,
  vpState?: VpReconciliationState,
  refundBroadcastAt?: number,
  now?: number,
): SdkPeginAction[] {
  if (!localStatus) return sdkActions;

  if (contractStatus === ContractStatus.PENDING) {
    if (localStatus === LocalStorageStatus.PAYOUT_SIGNED) {
      // If VP still needs WOTS key, has transactions ready for signing,
      // or hasn't even ingested the deposit yet, the local status is
      // stale or tampered — ignore the override.
      if (
        vpState?.needsWotsKey ||
        vpState?.transactionsReady ||
        vpState?.pendingIngestion
      ) {
        return sdkActions;
      }
      return [];
    }
    if (localStatus === LocalStorageStatus.CONFIRMING) {
      // If VP explicitly reports no pending ingestion (broadcast not
      // detected), the local status is stale — ignore the override.
      if (vpState?.pendingIngestion === false) return sdkActions;
      return sdkActions.filter(
        (a) => a !== SdkPeginAction.SIGN_AND_BROADCAST_TO_BITCOIN,
      );
    }
  }

  if (contractStatus === ContractStatus.VERIFIED) {
    if (localStatus === LocalStorageStatus.CONFIRMED) return [];
  }

  if (contractStatus === ContractStatus.EXPIRED) {
    if (localStatus === LocalStorageStatus.REFUND_BROADCAST) {
      if (isRefundBroadcastWithinTtl(refundBroadcastAt, now)) return [];
    }
  }

  return sdkActions;
}

/**
 * The suppression must auto-expire — broadcast txs can be evicted from the
 * mempool, and a sticky marker would otherwise hide the refund action while
 * the vault is still EXPIRED on-chain. Legacy entries without a timestamp are
 * treated as expired so the user can always retry.
 */
function isRefundBroadcastWithinTtl(
  refundBroadcastAt: number | undefined,
  now: number | undefined,
): boolean {
  if (refundBroadcastAt === undefined) return false;
  const currentTime = now ?? Date.now();
  return currentTime - refundBroadcastAt < REFUND_BROADCAST_SUPPRESSION_MS;
}

interface DisplayInfo {
  displayLabel: PeginDisplayLabel;
  displayVariant: "pending" | "active" | "inactive" | "warning";
  message?: string;
  awaitingPayoutPrep?: boolean;
  refundMaturityState?: RefundMaturityState;
  refundMaturesInBlocks?: number;
  inlineSubtext?: string;
}

function getDisplay(
  contractStatus: ContractStatus,
  actions: PeginAction[],
  options: GetPeginStateOptions,
): DisplayInfo {
  const {
    localStatus,
    isInUse,
    expirationReason,
    expiredAt,
    vpTerminalError,
    refundBroadcastAt,
    now,
  } = options;

  const hasNoActions = actions.length === 1 && actions[0] === PeginAction.NONE;

  if (contractStatus === ContractStatus.PENDING) {
    if (vpTerminalError) {
      return {
        displayLabel: PEGIN_DISPLAY_LABELS.FAILED,
        displayVariant: "warning",
        message: vpTerminalError,
      };
    }
    if (localStatus === LocalStorageStatus.PAYOUT_SIGNED && hasNoActions) {
      return {
        displayLabel: PEGIN_DISPLAY_LABELS.PROCESSING,
        displayVariant: "pending",
        message: COPY.pegin.messages.payoutSignaturesSubmitted,
      };
    }
    if (actions.includes(PeginAction.SUBMIT_WOTS_KEY)) {
      return {
        displayLabel: PEGIN_DISPLAY_LABELS.AWAITING_KEY,
        displayVariant: "pending",
        message: COPY.pegin.messages.awaitingWotsKey,
      };
    }
    if (actions.includes(PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN)) {
      return {
        displayLabel: PEGIN_DISPLAY_LABELS.PENDING,
        displayVariant: "pending",
        message: COPY.pegin.messages.broadcastMayHaveFailed,
      };
    }
    if (actions.includes(PeginAction.SIGN_PAYOUT_TRANSACTIONS)) {
      return {
        displayLabel: PEGIN_DISPLAY_LABELS.SIGNING_REQUIRED,
        displayVariant: "pending",
        message: COPY.pegin.messages.payoutsReadyForSigning,
      };
    }
    // BTC confirmed at protocol depth (mempool ground truth), VP still
    // ingesting. Distinct from "broadcast but not yet confirmed" — the message
    // surfaces a stuck VP plainly instead of falsely blaming the BTC wait,
    // while the stepper stays on the shared "confirming deposit" step.
    if (
      options.pendingIngestion === true &&
      options.prePeginBroadcastConfirmed === true
    ) {
      return {
        displayLabel: PEGIN_DISPLAY_LABELS.PENDING,
        displayVariant: "pending",
        message: COPY.pegin.messages.prePeginIngesting,
      };
    }
    // Broadcast happened (chain says the tx is on the network, or the local
    // CONFIRMING marker says so) but it is not yet confirmed at depth — a
    // Bitcoin-confirmation wait. Keyed on `prePeginBroadcastSeen` too so every
    // tab shows this, not just the one that broadcast.
    if (
      options.pendingIngestion === true &&
      (options.prePeginBroadcastSeen === true ||
        localStatus === LocalStorageStatus.CONFIRMING)
    ) {
      return {
        displayLabel: PEGIN_DISPLAY_LABELS.PENDING,
        displayVariant: "pending",
        message: COPY.pegin.messages.prePeginBroadcast,
      };
    }
    if (options.pendingIngestion === undefined && !options.transactionsReady) {
      return {
        displayLabel: PEGIN_DISPLAY_LABELS.PENDING,
        displayVariant: "pending",
        message: COPY.pegin.messages.waitingForDetection,
      };
    }
    return {
      displayLabel: PEGIN_DISPLAY_LABELS.PENDING,
      displayVariant: "pending",
      message: COPY.pegin.messages.waitingForPayoutPrep,
      awaitingPayoutPrep: true,
    };
  }

  if (contractStatus === ContractStatus.VERIFIED) {
    if (localStatus === LocalStorageStatus.CONFIRMED) {
      return {
        displayLabel: PEGIN_DISPLAY_LABELS.PROCESSING,
        displayVariant: "pending",
        message: COPY.pegin.messages.activationSubmitted,
      };
    }
    return {
      displayLabel: PEGIN_DISPLAY_LABELS.READY_TO_ACTIVATE,
      displayVariant: "pending",
      message: COPY.pegin.messages.readyToActivate,
    };
  }

  if (contractStatus === ContractStatus.ACTIVE) {
    if (isInUse) {
      return {
        displayLabel: PEGIN_DISPLAY_LABELS.IN_USE,
        displayVariant: "active",
        message: COPY.pegin.messages.inUseCannotRedeem,
      };
    }
    return {
      displayLabel: PEGIN_DISPLAY_LABELS.AVAILABLE,
      displayVariant: "active",
    };
  }

  if (contractStatus === ContractStatus.REDEEMED) {
    return {
      displayLabel: PEGIN_DISPLAY_LABELS.REDEEM_IN_PROGRESS,
      displayVariant: "pending",
      message: COPY.pegin.messages.redemptionInProgress,
    };
  }

  if (contractStatus === ContractStatus.LIQUIDATED) {
    return {
      displayLabel: PEGIN_DISPLAY_LABELS.LIQUIDATED,
      displayVariant: "warning",
      message: COPY.pegin.messages.liquidated,
    };
  }

  if (contractStatus === ContractStatus.EXPIRED) {
    if (
      localStatus === LocalStorageStatus.REFUND_BROADCAST &&
      isRefundBroadcastWithinTtl(refundBroadcastAt, now)
    ) {
      return {
        displayLabel: PEGIN_DISPLAY_LABELS.REFUNDING,
        displayVariant: "pending",
        message: COPY.pegin.messages.refundBroadcast,
      };
    }
    const expiredMessage = buildExpiredMessage(expirationReason, expiredAt);
    const refundMaturityState = options.refundMaturityState;
    const refundMaturesInBlocks = options.refundMaturesInBlocks;
    if (
      refundMaturityState === "maturing" &&
      refundMaturesInBlocks !== undefined
    ) {
      // Convert the remaining-blocks figure to a rough hour estimate for the
      // message. Round up so a fractional last block doesn't display as 0
      // hours.
      const hours = Math.max(
        1,
        Math.ceil(
          (refundMaturesInBlocks * BTC_BLOCK_TIME_MINS) / MINS_PER_HOUR,
        ),
      );
      // Tooltip stays focused on the expired reason + when; the countdown
      // lives in `inlineSubtext` so the user doesn't need to hover to see
      // the actionable info.
      return {
        displayLabel: PEGIN_DISPLAY_LABELS.EXPIRED,
        displayVariant: "warning",
        message: expiredMessage,
        inlineSubtext: COPY.pegin.messages.refundMaturing(
          refundMaturesInBlocks,
          hours,
        ),
        refundMaturityState,
        refundMaturesInBlocks,
      };
    }
    if (refundMaturityState === "unknown") {
      return {
        displayLabel: PEGIN_DISPLAY_LABELS.EXPIRED,
        displayVariant: "warning",
        message: expiredMessage,
        inlineSubtext: COPY.pegin.messages.refundMaturingUnknown,
        refundMaturityState,
      };
    }
    return {
      displayLabel: PEGIN_DISPLAY_LABELS.EXPIRED,
      displayVariant: "warning",
      message: expiredMessage,
      refundMaturityState: refundMaturityState ?? "mature",
    };
  }

  if (contractStatus === ContractStatus.INVALID) {
    return {
      displayLabel: PEGIN_DISPLAY_LABELS.INVALID,
      displayVariant: "warning",
      message: COPY.pegin.messages.invalid,
    };
  }

  if (contractStatus === ContractStatus.DEPOSITOR_WITHDRAWN) {
    return {
      displayLabel: PEGIN_DISPLAY_LABELS.REDEEMED,
      displayVariant: "inactive",
      message: COPY.pegin.messages.redemptionComplete,
    };
  }

  return {
    displayLabel: PEGIN_DISPLAY_LABELS.UNKNOWN,
    displayVariant: "inactive",
  };
}

// ============================================================================
// getPrimaryActionButton
// ============================================================================

export function getPrimaryActionButton(state: PeginState): {
  label: string;
  action: PeginAction;
} | null {
  if (state.availableActions.includes(PeginAction.SUBMIT_WOTS_KEY)) {
    return {
      label: COPY.pegin.primaryAction.SUBMIT_WOTS_KEY,
      action: PeginAction.SUBMIT_WOTS_KEY,
    };
  }
  if (state.availableActions.includes(PeginAction.SIGN_PAYOUT_TRANSACTIONS)) {
    return {
      label: COPY.pegin.primaryAction.SIGN_PAYOUT_TRANSACTIONS,
      action: PeginAction.SIGN_PAYOUT_TRANSACTIONS,
    };
  }
  if (
    state.availableActions.includes(PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN)
  ) {
    return {
      label: COPY.pegin.primaryAction.SIGN_AND_BROADCAST_TO_BITCOIN,
      action: PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN,
    };
  }
  if (state.availableActions.includes(PeginAction.ACTIVATE_VAULT)) {
    return {
      label: COPY.pegin.primaryAction.ACTIVATE_VAULT,
      action: PeginAction.ACTIVATE_VAULT,
    };
  }
  if (state.availableActions.includes(PeginAction.REFUND_HTLC)) {
    return {
      label: COPY.pegin.primaryAction.REFUND_HTLC,
      action: PeginAction.REFUND_HTLC,
    };
  }
  return null;
}

// ============================================================================
// Progress step mapping — maps the live pegin state onto the shared deposit
// flow model (the single source of truth for step numbers and labels lives in
// DepositProgressView/steps.ts). Used to render a progress bar on pending
// deposit cards. The step is derived from the actual contract status, pending
// next action, and local tracking — not a fixed value — so it tracks the real
// position of each deposit.
// ============================================================================

/**
 * Derive a pending deposit's position in the deposit flow from its live state,
 * or `null` when there is no meaningful in-progress step (terminal/active/
 * expired states, which the pending sections already filter out).
 *
 * The next available action is the most reliable signal of where a deposit
 * sits; when no action is pending we fall back to contract/local status to tell
 * "awaiting Bitcoin confirmation" apart from "payouts signed, awaiting the VP".
 */
export function getPeginDisplayStep(state: PeginState): DepositFlowStep | null {
  const { contractStatus, availableActions, localStatus } = state;

  // A warning state (e.g. a terminal provider failure, expired, liquidated,
  // invalid) is not in-progress — never show a step/progress bar for it, so a
  // failed deposit doesn't look like it is still advancing.
  if (state.displayVariant === "warning") return null;

  if (contractStatus === ContractStatus.PENDING) {
    if (availableActions.includes(PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN)) {
      return DepositFlowStep.BROADCAST_PRE_PEGIN;
    }
    if (availableActions.includes(PeginAction.SUBMIT_WOTS_KEY)) {
      return DepositFlowStep.SUBMIT_WOTS_KEYS;
    }
    if (availableActions.includes(PeginAction.SIGN_PAYOUT_TRANSACTIONS)) {
      // The deposit is resting *before* it signs. When the user clicks "Sign
      // Payouts" the flow first runs the auth-anchor step (deriveContextHash),
      // then the payout signing — so the next step the deposit is positioned on
      // is SIGN_AUTH_ANCHOR, not SIGN_PAYOUTS. Reporting SIGN_PAYOUTS here would
      // count the auth-anchor step as already done and show one step too far.
      return DepositFlowStep.SIGN_AUTH_ANCHOR;
    }
    // No action pending. Once payouts are signed the deposit is waiting for VP
    // verification/ACK submission. If the VP has ingested the deposit but
    // payout transactions are not ready, it is preparing the signing package.
    // Otherwise it is still confirming the Pre-PegIn — whether waiting on BTC
    // depth or on a VP still at PendingIngestion, both share the "confirming
    // deposit" step and are told apart by the status message.
    if (localStatus === LocalStorageStatus.PAYOUT_SIGNED) {
      return DepositFlowStep.AWAIT_VP_VERIFICATION;
    }
    if (state.awaitingPayoutPrep) {
      return DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS;
    }
    return DepositFlowStep.AWAIT_BTC_CONFIRMATION;
  }

  if (contractStatus === ContractStatus.VERIFIED) {
    if (localStatus === LocalStorageStatus.CONFIRMED) {
      return DepositFlowStep.AWAIT_ACTIVATION_CONFIRMATION;
    }
    return DepositFlowStep.RETRIEVE_SECRET;
  }

  return null;
}

/**
 * Freeze a warning/terminal vault at the last locally-known deposit-flow step.
 *
 * Warning states intentionally do not return a normal display step: they are
 * not actively progressing. This helper gives the multistepper a truthful
 * place to stop instead of mirroring another sibling or defaulting to success.
 */
export function getWarningPeginDisplayStep(
  localStatus: LocalStorageStatus | undefined,
): DepositFlowStep {
  switch (localStatus) {
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

// ============================================================================
// State Transition Helpers
// ============================================================================

export function getNextLocalStatus(
  currentAction: PeginAction,
): LocalStorageStatus | null {
  switch (currentAction) {
    case PeginAction.SIGN_PAYOUT_TRANSACTIONS:
      return LocalStorageStatus.PAYOUT_SIGNED;
    case PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN:
      return LocalStorageStatus.CONFIRMING;
    case PeginAction.ACTIVATE_VAULT:
      return LocalStorageStatus.CONFIRMED;
    default:
      return null;
  }
}

/**
 * True when the vault is at or past activation success/failure: the
 * post-deposit continuation should no longer pick it up.
 *
 * `VERIFIED + CONFIRMED` is the optimistic post-activation state used while
 * the indexer catches up; the rest are terminal contract states.
 */
export function isVaultPastActivation(state: PeginState | undefined): boolean {
  if (!state) return false;
  const { contractStatus, localStatus } = state;
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

/**
 * True only when the vault is *successfully activated* — `ACTIVE` on-chain, or
 * the optimistic `VERIFIED + CONFIRMED` state while the indexer catches up.
 *
 * Narrower than {@link isVaultPastActivation}, which also counts terminal
 * REDEEMED/LIQUIDATED/WITHDRAWN states. Use this for the activation-success
 * messaging so a liquidated/redeemed sibling can never read as "activated".
 */
export function isVaultActivated(state: PeginState | undefined): boolean {
  if (!state) return false;
  const { contractStatus, localStatus } = state;
  if (contractStatus === ContractStatus.ACTIVE) return true;
  return (
    contractStatus === ContractStatus.VERIFIED &&
    localStatus === LocalStorageStatus.CONFIRMED
  );
}

export function shouldRemoveFromLocalStorage(
  contractStatus: ContractStatus,
  localStatus: LocalStorageStatus,
  refundBroadcastAt?: number,
  now?: number,
): boolean {
  // Exception comes before the terminal-status check so the marker survives
  // until the contract advances past EXPIRED — but only while the broadcast
  // is still within the suppression TTL. Past the TTL the marker is stale
  // and clearing it lets the EXPIRED state surface the refund action again.
  if (
    contractStatus === ContractStatus.EXPIRED &&
    localStatus === LocalStorageStatus.REFUND_BROADCAST &&
    isRefundBroadcastWithinTtl(refundBroadcastAt, now)
  ) {
    return false;
  }

  if (
    contractStatus === ContractStatus.ACTIVE ||
    contractStatus === ContractStatus.REDEEMED ||
    contractStatus === ContractStatus.LIQUIDATED ||
    contractStatus === ContractStatus.INVALID ||
    contractStatus === ContractStatus.DEPOSITOR_WITHDRAWN ||
    contractStatus === ContractStatus.EXPIRED
  ) {
    return true;
  }

  if (
    localStatus === LocalStorageStatus.PENDING &&
    contractStatus === ContractStatus.VERIFIED
  ) {
    return true;
  }

  return false;
}
