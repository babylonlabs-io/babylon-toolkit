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

export const PEGIN_DISPLAY_LABELS = {
  PENDING: "Pending",
  SIGNING_REQUIRED: "Signing required",
  AWAITING_KEY: "Awaiting key",
  PROCESSING: "Processing",
  READY_TO_ACTIVATE: "Ready to Activate",
  AVAILABLE: "Available",
  IN_USE: "In Use",
  REDEEM_IN_PROGRESS: "Redeem in Progress",
  REDEEMED: "Redeemed",
  LIQUIDATED: "Liquidated",
  EXPIRED: "Expired",
  FAILED: "Failed",
  INVALID: "Invalid",
  UNKNOWN: "Unknown",
} as const;

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
}

// ============================================================================
// Expiration helpers
// ============================================================================

export const EXPIRATION_REASON_LABELS: Record<ExpirationReason, string> = {
  ack_timeout: "The vault provider did not acknowledge in time",
  proof_timeout: "The inclusion proof was not submitted in time",
  activation_timeout: "The vault was not activated in time",
};

export function formatExpiredTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 0) return "just now";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
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
    "This vault has expired.",
    reason ? `${reason}.` : null,
    expiredAt ? `Expired ${formatExpiredTimeAgo(expiredAt)}.` : null,
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
): SdkPeginAction[] {
  if (!localStatus) return sdkActions;

  if (contractStatus === ContractStatus.PENDING) {
    if (localStatus === LocalStorageStatus.PAYOUT_SIGNED) {
      // If VP still needs WOTS key or has transactions ready for signing,
      // the local status is stale or tampered — ignore the override.
      if (vpState?.needsWotsKey || vpState?.transactionsReady) {
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

  return sdkActions;
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
  const { localStatus, isInUse, expirationReason, expiredAt, vpTerminalError } =
    options;

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
        message:
          "Payout signatures submitted. Vault provider is verifying and collecting acknowledgements...",
      };
    }
    if (actions.includes(PeginAction.SUBMIT_WOTS_KEY)) {
      return {
        displayLabel: PEGIN_DISPLAY_LABELS.AWAITING_KEY,
        displayVariant: "pending",
        message:
          "Vault provider is waiting for your WOTS public key. Click 'Submit WOTS Key' to continue.",
      };
    }
    if (actions.includes(PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN)) {
      return {
        displayLabel: PEGIN_DISPLAY_LABELS.PENDING,
        displayVariant: "pending",
        message:
          "Vault provider has not detected your deposit. The Pre-PegIn transaction may not have been broadcast. Click 'Broadcast' to retry.",
      };
    }
    if (actions.includes(PeginAction.SIGN_PAYOUT_TRANSACTIONS)) {
      return {
        displayLabel: PEGIN_DISPLAY_LABELS.SIGNING_REQUIRED,
        displayVariant: "pending",
      };
    }
    if (
      options.pendingIngestion === true &&
      localStatus === LocalStorageStatus.CONFIRMING
    ) {
      return {
        displayLabel: PEGIN_DISPLAY_LABELS.PENDING,
        displayVariant: "pending",
        message:
          "Pre-PegIn transaction broadcast. Waiting for vault provider to detect your deposit...",
      };
    }
    if (options.pendingIngestion === undefined && !options.transactionsReady) {
      return {
        displayLabel: PEGIN_DISPLAY_LABELS.PENDING,
        displayVariant: "pending",
        message: "Waiting for vault provider to detect your deposit...",
      };
    }
    return {
      displayLabel: PEGIN_DISPLAY_LABELS.PENDING,
      displayVariant: "pending",
      message:
        "Waiting for vault provider to prepare Claim and Payout transactions...",
    };
  }

  if (contractStatus === ContractStatus.VERIFIED) {
    if (localStatus === LocalStorageStatus.CONFIRMED) {
      return {
        displayLabel: PEGIN_DISPLAY_LABELS.PROCESSING,
        displayVariant: "pending",
        message:
          "Vault activation submitted. Waiting for on-chain confirmation...",
      };
    }
    return {
      displayLabel: PEGIN_DISPLAY_LABELS.READY_TO_ACTIVATE,
      displayVariant: "pending",
      message:
        "Bitcoin transaction confirmed. Reveal your HTLC secret to activate the vault.",
    };
  }

  if (contractStatus === ContractStatus.ACTIVE) {
    if (isInUse) {
      return {
        displayLabel: PEGIN_DISPLAY_LABELS.IN_USE,
        displayVariant: "active",
        message:
          "Vault is currently being used as collateral. Repay all debt before redeeming.",
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
      message:
        "Your redemption is being processed. The vault provider is preparing your BTC withdrawal. This typically takes up to 3 days.",
    };
  }

  if (contractStatus === ContractStatus.LIQUIDATED) {
    return {
      displayLabel: PEGIN_DISPLAY_LABELS.LIQUIDATED,
      displayVariant: "warning",
      message:
        "This vault was liquidated. The collateral was seized to cover unpaid debt.",
    };
  }

  if (contractStatus === ContractStatus.EXPIRED) {
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
      message:
        "This vault is invalid. The BTC UTXOs were spent in a different transaction.",
    };
  }

  if (contractStatus === ContractStatus.DEPOSITOR_WITHDRAWN) {
    return {
      displayLabel: PEGIN_DISPLAY_LABELS.REDEEMED,
      displayVariant: "inactive",
      message:
        "Redemption complete. Your BTC has been returned to your wallet.",
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
    return { label: "Submit WOTS Key", action: PeginAction.SUBMIT_WOTS_KEY };
  }
  if (state.availableActions.includes(PeginAction.SIGN_PAYOUT_TRANSACTIONS)) {
    return { label: "Sign", action: PeginAction.SIGN_PAYOUT_TRANSACTIONS };
  }
  if (
    state.availableActions.includes(PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN)
  ) {
    return {
      label: "Broadcast Pre-PegIn",
      action: PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN,
    };
  }
  if (state.availableActions.includes(PeginAction.ACTIVATE_VAULT)) {
    return { label: "Activate", action: PeginAction.ACTIVATE_VAULT };
  }
  if (state.availableActions.includes(PeginAction.REFUND_HTLC)) {
    return { label: "Refund", action: PeginAction.REFUND_HTLC };
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
): boolean {
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
