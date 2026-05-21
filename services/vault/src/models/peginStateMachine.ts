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

import { COPY } from "@/copy";
import { DepositFlowStep } from "@/hooks/deposit/depositFlowSteps/types";

export { ContractStatus } from "@babylonlabs-io/ts-sdk/tbv/core/services";
export type {
  ExpirationReason,
  GetPeginProtocolStateOptions,
  PeginProtocolState,
} from "@babylonlabs-io/ts-sdk/tbv/core/services";

export {
  DaemonStatus,
  POST_WOTS_STATUSES,
  PRE_DEPOSITOR_SIGNATURES_STATES,
  VP_TRANSIENT_STATUSES,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";

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

export interface PeginState {
  contractStatus: ContractStatus;
  localStatus?: LocalStorageStatus;
  displayLabel: PeginDisplayLabel;
  displayVariant: "pending" | "active" | "inactive" | "warning";
  availableActions: PeginAction[];
  message?: string;
}

export interface GetPeginStateOptions {
  localStatus?: LocalStorageStatus;
  transactionsReady?: boolean;
  isInUse?: boolean;
  needsWotsKey?: boolean;
  pendingIngestion?: boolean;
  expirationReason?: ExpirationReason;
  expiredAt?: number;
  canRefund?: boolean;
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
export const REFUND_BROADCAST_SUPPRESSION_MS = 6 * 60 * 60 * 1000;

// ============================================================================
// Expiration helpers
// ============================================================================

export const EXPIRATION_REASON_LABELS: Record<ExpirationReason, string> =
  COPY.pegin.expiration.reasons;

export function formatExpiredTimeAgo(timestamp: number): string {
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

export function buildExpiredMessage(
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
  const actions = mapActions(sdkActions);
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
    if (
      options.pendingIngestion === true &&
      localStatus === LocalStorageStatus.CONFIRMING
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
    return {
      displayLabel: PEGIN_DISPLAY_LABELS.EXPIRED,
      displayVariant: "warning",
      message: buildExpiredMessage(expirationReason, expiredAt),
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

  if (contractStatus === ContractStatus.PENDING) {
    if (availableActions.includes(PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN)) {
      return DepositFlowStep.BROADCAST_PRE_PEGIN;
    }
    if (availableActions.includes(PeginAction.SUBMIT_WOTS_KEY)) {
      return DepositFlowStep.SUBMIT_WOTS_KEYS;
    }
    if (availableActions.includes(PeginAction.SIGN_PAYOUT_TRANSACTIONS)) {
      return DepositFlowStep.SIGN_PAYOUTS;
    }
    // No action pending. Once payouts are signed the deposit is waiting for the
    // VP to verify on-chain (artifact-download stage); otherwise it is still
    // waiting for the Pre-Pegin to confirm / be detected.
    if (localStatus === LocalStorageStatus.PAYOUT_SIGNED) {
      return DepositFlowStep.ARTIFACT_DOWNLOAD;
    }
    return DepositFlowStep.AWAIT_BTC_CONFIRMATION;
  }

  if (contractStatus === ContractStatus.VERIFIED) {
    // Ready to activate, or activation already broadcast and awaiting
    // confirmation — both sit on the final reveal/activate step.
    return DepositFlowStep.ACTIVATE_VAULT;
  }

  return null;
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
