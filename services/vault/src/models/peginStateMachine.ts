/**
 * Peg-In State Machine
 *
 * Centralized definition of all peg-in states and their transitions.
 * This acts as the single source of truth for state management across:
 * - Smart contract states
 * - localStorage states
 * - UI display states
 * - User actions
 *
 * Based on /btc-vault/docs/pegin.md
 */

import {
  DaemonStatus,
  POST_WOTS_STATUSES,
  PRE_DEPOSITOR_SIGNATURES_STATES,
  VP_TRANSIENT_STATUSES,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";

export {
  DaemonStatus,
  POST_WOTS_STATUSES,
  PRE_DEPOSITOR_SIGNATURES_STATES,
  VP_TRANSIENT_STATUSES,
};

// ============================================================================
// State Definitions
// ============================================================================

/**
 * Vault status — combines on-chain contract status (0-4) with indexer-derived
 * statuses (5-7). The contract enum (BTCVaultRegistry.sol BTCVaultStatus) only
 * has: Pending(0), Verified(1), Active(2), Redeemed(3), Expired(4).
 * The indexer maps these and adds extra statuses for UI display.
 *
 * IMPORTANT: With the new contract architecture:
 * - Core vault status (BTCVaultRegistry) does NOT change when used by applications
 * - Vaults remain at ACTIVE status even when used in DeFi positions
 * - Application usage status is tracked separately by each integration controller
 */
export enum ContractStatus {
  /** Status 0: Request submitted, waiting for ACKs */
  PENDING = 0,
  /** Status 1: All ACKs collected, ready for secret activation */
  VERIFIED = 1,
  /** Status 2: HTLC secret revealed, vault is active and usable (stays here even when used by apps) */
  ACTIVE = 2,
  /** Status 3: Vault has been redeemed, BTC is claimable */
  REDEEMED = 3,
  /** Status 4 (indexer-only): Vault was liquidated (collateral seized due to unpaid debt) */
  LIQUIDATED = 4,
  /** Status 5 (indexer-only): Vault is invalid — BTC UTXOs were spent in a different transaction */
  INVALID = 5,
  /** Status 6 (indexer-only): Depositor has withdrawn their BTC (redemption complete) */
  DEPOSITOR_WITHDRAWN = 6,
  /** Status 7 (indexer-only): Vault expired due to AckTimeout or ActivationTimeout */
  EXPIRED = 7,
}

/** Reason why a vault expired */
export type ExpirationReason =
  | "ack_timeout"
  | "proof_timeout"
  | "activation_timeout";

/**
 * Local storage status (off-chain, temporary)
 * Used to track user actions before blockchain confirmation
 */
export enum LocalStorageStatus {
  /** Initial state: Peg-in request submitted to contract */
  PENDING = "pending",
  /** Depositor submitted payout signatures, waiting for on-chain ACK */
  PAYOUT_SIGNED = "payout_signed",
  /** BTC transaction broadcasted, waiting for confirmations */
  CONFIRMING = "confirming",
  /** Confirmed on blockchain (should be removed from localStorage) */
  CONFIRMED = "confirmed",
}

/**
 * Check if an error indicates the vault provider is still processing
 * (before PendingDepositorSignatures state).
 *
 * Use this to determine if polling should continue vs showing an error.
 */
export function isPreDepositorSignaturesError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message;

  return (
    msg.includes("Invalid state") &&
    PRE_DEPOSITOR_SIGNATURES_STATES.some((state) => msg.includes(state))
  );
}

// ============================================================================
// Unified State Model
// ============================================================================

/**
 * Display label constants for peg-in states
 * These are the labels shown to users in the UI
 */
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

/**
 * All possible display labels for peg-in states
 * These are the labels shown to users in the UI
 */
export type PeginDisplayLabel =
  (typeof PEGIN_DISPLAY_LABELS)[keyof typeof PEGIN_DISPLAY_LABELS];

/**
 * Unified peg-in state combining all sources
 */
export interface PeginState {
  /** Smart contract status (source of truth for on-chain state) */
  contractStatus: ContractStatus;
  /** Local storage status (temporary, off-chain) */
  localStatus?: LocalStorageStatus;
  /** Display label for UI */
  displayLabel: PeginDisplayLabel;
  /** Display variant for styling */
  displayVariant: "pending" | "active" | "inactive" | "warning";
  /** Available user actions */
  availableActions: PeginAction[];
  /** Informational message (if any) */
  message?: string;
}

/**
 * Available actions user can take
 * Note: Only includes ACTUAL user actions, not waiting states
 */
export enum PeginAction {
  /** Submit WOTS key (re-enter mnemonic) */
  SUBMIT_WOTS_KEY = "SUBMIT_WOTS_KEY",
  /** Sign payout transactions */
  SIGN_PAYOUT_TRANSACTIONS = "SIGN_PAYOUT_TRANSACTIONS",
  /** Sign and broadcast peg-in transaction to Bitcoin */
  SIGN_AND_BROADCAST_TO_BITCOIN = "SIGN_AND_BROADCAST_TO_BITCOIN",
  /** Reveal HTLC secret on Ethereum to activate vault */
  ACTIVATE_VAULT = "ACTIVATE_VAULT",
  /** Sign and broadcast HTLC refund transaction for an expired vault */
  REFUND_HTLC = "REFUND_HTLC",
  /** No action available - user must wait */
  NONE = "NONE",
}

// ============================================================================
// State Machine Logic
// ============================================================================

/**
 * Options for getPeginState function
 */
export interface GetPeginStateOptions {
  /** Off-chain localStorage status (optional, temporary) */
  localStatus?: LocalStorageStatus;
  /** Whether claim/payout transactions are ready from VP */
  transactionsReady?: boolean;
  /** Whether vault is in use by an application (from ApplicationVaultTracker) */
  isInUse?: boolean;
  /** Whether the vault provider is waiting for the depositor's WOTS public key */
  needsWotsKey?: boolean;
  /** Whether the vault provider hasn't ingested this peg-in yet */
  pendingIngestion?: boolean;
  /** Expiration reason (only relevant when status is EXPIRED) */
  expirationReason?: ExpirationReason;
  /** Timestamp when vault expired in milliseconds (only relevant when status is EXPIRED) */
  expiredAt?: number;
  /** Whether the depositor can refund the HTLC (Pre-PegIn tx available) */
  canRefund?: boolean;
  /** Terminal error message from vault provider (e.g. expired, claim posted, pegged out) */
  vpTerminalError?: string;
}

const EXPIRATION_REASON_LABELS: Record<ExpirationReason, string> = {
  ack_timeout: "The vault provider did not acknowledge in time",
  proof_timeout: "The inclusion proof was not submitted in time",
  activation_timeout: "The vault was not activated in time",
};

function formatExpiredTimeAgo(timestamp: number): string {
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

function buildExpiredMessage(
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
 * Determine the current state and available actions based on contract and local status
 *
 * @param contractStatus - On-chain contract status (source of truth)
 * @param options - Optional parameters (localStatus, transactionsReady, isInUse)
 * @returns Unified peg-in state with available actions
 */
export function getPeginState(
  contractStatus: ContractStatus,
  options: GetPeginStateOptions = {},
): PeginState {
  const {
    localStatus,
    transactionsReady,
    isInUse,
    needsWotsKey,
    pendingIngestion,
    expirationReason,
    expiredAt,
    canRefund,
    vpTerminalError,
  } = options;

  // Contract Status 0: Pending (Request submitted, waiting for ACKs)
  if (contractStatus === ContractStatus.PENDING) {
    // Sub-state: Vault provider reported a terminal status (expired, claimed, pegged out).
    // The on-chain contract may not have caught up yet, but the VP is done.
    // This takes priority over all other sub-states because a terminal VP
    // status means the deposit cannot proceed regardless.
    if (vpTerminalError) {
      return {
        contractStatus,
        localStatus,
        displayLabel: PEGIN_DISPLAY_LABELS.FAILED,
        displayVariant: "warning",
        availableActions: [PeginAction.NONE],
        message: vpTerminalError,
      };
    }

    // Sub-state: Depositor already signed (waiting for on-chain ACK)
    if (localStatus === LocalStorageStatus.PAYOUT_SIGNED) {
      return {
        contractStatus,
        localStatus,
        displayLabel: PEGIN_DISPLAY_LABELS.PROCESSING,
        displayVariant: "pending",
        availableActions: [PeginAction.NONE],
        message:
          "Payout signatures submitted. Vault provider is verifying and collecting acknowledgements...",
      };
    }

    // Sub-state: Vault provider waiting for depositor's WOTS public key
    if (needsWotsKey) {
      return {
        contractStatus,
        localStatus,
        displayLabel: PEGIN_DISPLAY_LABELS.AWAITING_KEY,
        displayVariant: "pending",
        availableActions: [PeginAction.SUBMIT_WOTS_KEY],
        message:
          "Vault provider is waiting for your WOTS public key. Click 'Submit WOTS Key' to continue.",
      };
    }

    // Sub-state: VP confirmed it hasn't ingested this peg-in yet.
    // If we already broadcast (CONFIRMING), show a waiting state instead of
    // re-offering the broadcast button. The user already broadcast; VP just
    // hasn't detected it yet.
    if (pendingIngestion === true && !transactionsReady) {
      if (localStatus === LocalStorageStatus.CONFIRMING) {
        return {
          contractStatus,
          localStatus,
          displayLabel: PEGIN_DISPLAY_LABELS.PENDING,
          displayVariant: "pending",
          availableActions: [PeginAction.NONE],
          message:
            "Pre-PegIn transaction broadcast. Waiting for vault provider to detect your deposit...",
        };
      }
      return {
        contractStatus,
        localStatus,
        displayLabel: PEGIN_DISPLAY_LABELS.PENDING,
        displayVariant: "pending",
        availableActions: [PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN],
        message:
          "Vault provider has not detected your deposit. The Pre-PegIn transaction may not have been broadcast. Click 'Broadcast' to retry.",
      };
    }

    // Sub-state: We haven't received any polling response yet (initial state
    // after submission). pendingIngestion is undefined before first poll.
    if (pendingIngestion === undefined && !transactionsReady) {
      return {
        contractStatus,
        localStatus,
        displayLabel: PEGIN_DISPLAY_LABELS.PENDING,
        displayVariant: "pending",
        availableActions: [PeginAction.NONE],
        message: "Waiting for vault provider to detect your deposit...",
      };
    }

    // Sub-state: VP has ingested but transactions aren't ready yet
    // (e.g. after WOTS key submitted, VP is preparing claim/payout txns)
    if (!transactionsReady) {
      return {
        contractStatus,
        localStatus,
        displayLabel: PEGIN_DISPLAY_LABELS.PENDING,
        displayVariant: "pending",
        availableActions: [PeginAction.NONE],
        message:
          "Waiting for vault provider to prepare Claim and Payout transactions...",
      };
    }

    // Ready to sign payout transactions
    return {
      contractStatus,
      localStatus,
      displayLabel: PEGIN_DISPLAY_LABELS.SIGNING_REQUIRED,
      displayVariant: "pending",
      availableActions: [PeginAction.SIGN_PAYOUT_TRANSACTIONS],
    };
  }

  // Contract Status 1: Verified (All ACKs collected, ready for activation)
  if (contractStatus === ContractStatus.VERIFIED) {
    // Sub-state: Vault already activated (secret revealed on ETH), waiting for
    // indexer to update contract status from VERIFIED → ACTIVE
    if (localStatus === LocalStorageStatus.CONFIRMED) {
      return {
        contractStatus,
        localStatus,
        displayLabel: PEGIN_DISPLAY_LABELS.PROCESSING,
        displayVariant: "pending",
        availableActions: [PeginAction.NONE],
        message:
          "Vault activation submitted. Waiting for on-chain confirmation...",
      };
    }

    // Sub-state: BTC was already broadcast (CONFIRMING or later) — activate
    if (
      localStatus === LocalStorageStatus.CONFIRMING ||
      localStatus === LocalStorageStatus.PAYOUT_SIGNED
    ) {
      return {
        contractStatus,
        localStatus,
        displayLabel: PEGIN_DISPLAY_LABELS.READY_TO_ACTIVATE,
        displayVariant: "pending",
        availableActions: [PeginAction.ACTIVATE_VAULT],
        message:
          "Bitcoin transaction confirmed. Reveal your HTLC secret to activate the vault.",
      };
    }

    return {
      contractStatus,
      localStatus,
      displayLabel: PEGIN_DISPLAY_LABELS.READY_TO_ACTIVATE,
      displayVariant: "pending",
      availableActions: [PeginAction.ACTIVATE_VAULT],
      message:
        "Bitcoin transaction confirmed. Reveal your HTLC secret to activate the vault.",
    };
  }

  // Contract Status 2: Active (vault is active and usable)
  // NOTE: With new contract architecture, vault stays at ACTIVE even when used by applications
  // Application usage status is tracked separately by each integration controller
  if (contractStatus === ContractStatus.ACTIVE) {
    // Check if vault is in use by an application (e.g., Aave)
    if (isInUse) {
      return {
        contractStatus,
        localStatus,
        displayLabel: PEGIN_DISPLAY_LABELS.IN_USE,
        displayVariant: "active",
        availableActions: [PeginAction.NONE],
        message:
          "Vault is currently being used as collateral. Repay all debt before redeeming.",
      };
    }

    // Vault is active and NOT in use - available (withdrawal handled by application layer)
    return {
      contractStatus,
      localStatus,
      displayLabel: PEGIN_DISPLAY_LABELS.AVAILABLE,
      displayVariant: "active",
      availableActions: [PeginAction.NONE],
    };
  }

  // Contract Status 3: Redeemed (redemption initiated, BTC is being processed by vault provider)
  // Note: This is an intermediate state - BTC has NOT been returned to user yet
  if (contractStatus === ContractStatus.REDEEMED) {
    return {
      contractStatus,
      localStatus,
      displayLabel: PEGIN_DISPLAY_LABELS.REDEEM_IN_PROGRESS,
      displayVariant: "pending",
      availableActions: [PeginAction.NONE],
      message:
        "Your redemption is being processed. The vault provider is preparing your BTC withdrawal. This typically takes up to 3 days.",
    };
  }

  // Contract Status 4: Liquidated (collateral was seized due to unpaid debt)
  if (contractStatus === ContractStatus.LIQUIDATED) {
    return {
      contractStatus,
      localStatus,
      displayLabel: PEGIN_DISPLAY_LABELS.LIQUIDATED,
      displayVariant: "warning",
      availableActions: [PeginAction.NONE],
      message:
        "This vault was liquidated. The collateral was seized to cover unpaid debt.",
    };
  }

  // Contract Status 7 (indexer-only): Expired (AckTimeout or ProofTimeout)
  if (contractStatus === ContractStatus.EXPIRED) {
    return {
      contractStatus,
      localStatus,
      displayLabel: PEGIN_DISPLAY_LABELS.EXPIRED,
      displayVariant: "warning",
      availableActions: canRefund
        ? [PeginAction.REFUND_HTLC]
        : [PeginAction.NONE],
      message: buildExpiredMessage(expirationReason, expiredAt),
    };
  }

  // Contract Status 5: Invalid (UTXOs spent in a different transaction)
  if (contractStatus === ContractStatus.INVALID) {
    return {
      contractStatus,
      localStatus,
      displayLabel: PEGIN_DISPLAY_LABELS.INVALID,
      displayVariant: "warning",
      availableActions: [PeginAction.NONE],
      message:
        "This vault is invalid. The BTC UTXOs were spent in a different transaction.",
    };
  }

  // Contract Status 6: Depositor Withdrawn (redemption complete, BTC returned to user)
  if (contractStatus === ContractStatus.DEPOSITOR_WITHDRAWN) {
    return {
      contractStatus,
      localStatus,
      displayLabel: PEGIN_DISPLAY_LABELS.REDEEMED,
      displayVariant: "inactive",
      availableActions: [PeginAction.NONE],
      message:
        "Redemption complete. Your BTC has been returned to your wallet.",
    };
  }

  // Fallback: Unknown state
  return {
    contractStatus,
    localStatus,
    displayLabel: PEGIN_DISPLAY_LABELS.UNKNOWN,
    displayVariant: "inactive",
    availableActions: [PeginAction.NONE],
  };
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
 * Get the primary action button configuration for UI
 */
export function getPrimaryActionButton(state: PeginState): {
  label: string;
  action: PeginAction;
} | null {
  if (state.availableActions.includes(PeginAction.SUBMIT_WOTS_KEY)) {
    return {
      label: "Submit WOTS Key",
      action: PeginAction.SUBMIT_WOTS_KEY,
    };
  }

  if (state.availableActions.includes(PeginAction.SIGN_PAYOUT_TRANSACTIONS)) {
    return {
      label: "Sign",
      action: PeginAction.SIGN_PAYOUT_TRANSACTIONS,
    };
  }

  if (
    state.availableActions.includes(PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN)
  ) {
    return {
      label: "Broadcast BTC",
      action: PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN,
    };
  }

  if (state.availableActions.includes(PeginAction.ACTIVATE_VAULT)) {
    return {
      label: "Activate",
      action: PeginAction.ACTIVATE_VAULT,
    };
  }

  if (state.availableActions.includes(PeginAction.REFUND_HTLC)) {
    return {
      label: "Refund",
      action: PeginAction.REFUND_HTLC,
    };
  }

  return null;
}

// ============================================================================
// State Transition Helpers
// ============================================================================

/**
 * Get the next localStorage status after a successful action
 */
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
 * Check if localStorage entry should be removed (blockchain is source of truth)
 *
 * localStorage tracks user actions that may not be reflected on-chain yet.
 * We keep entries only when they provide information the blockchain doesn't have.
 *
 * Keep logic:
 * - PENDING localStorage: only useful when contract is still PENDING (pegin might not be indexed)
 * - PAYOUT_SIGNED localStorage: useful when contract is PENDING or VERIFIED (user signed, waiting for activation)
 * - CONFIRMING localStorage: useful when contract is VERIFIED (BTC broadcast, waiting for activation)
 *
 * Remove when:
 * - Contract reached terminal states (ACTIVE, REDEEMED, LIQUIDATED, INVALID, DEPOSITOR_WITHDRAWN)
 * - localStorage status is stale relative to contract status
 */
export function shouldRemoveFromLocalStorage(
  contractStatus: ContractStatus,
  localStatus: LocalStorageStatus,
): boolean {
  // Remove for terminal/confirmed states - blockchain is source of truth
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

  // Remove stale localStorage entries based on status progression
  // localStorage PENDING is only useful when contract is still PENDING
  if (
    localStatus === LocalStorageStatus.PENDING &&
    contractStatus === ContractStatus.VERIFIED
  ) {
    return true; // Contract moved past PENDING, localStorage adds no value
  }

  // Keep PAYOUT_SIGNED when contract is PENDING or VERIFIED (user signed, waiting for ACK/activation)
  // Keep CONFIRMING when contract is VERIFIED (user broadcast BTC, waiting for activation)
  return false;
}
