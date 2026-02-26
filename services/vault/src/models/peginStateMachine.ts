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

// ============================================================================
// State Definitions
// ============================================================================

/**
 * Smart contract peg-in status (on-chain)
 * Source: BTCVaultsManager.sol - enum BTCVaultStatus
 *
 * IMPORTANT: With the new contract architecture:
 * - Core vault status (BTCVaultsManager) does NOT change when used by applications
 * - Vaults remain at ACTIVE status even when used in DeFi positions
 * - Application usage status is tracked separately by each integration controller
 */
export enum ContractStatus {
  /** Status 0: Request submitted, waiting for ACKs */
  PENDING = 0,
  /** Status 1: All ACKs collected, ready for inclusion proof */
  VERIFIED = 1,
  /** Status 2: Inclusion proof verified, vault is active and usable (stays here even when used by apps) */
  ACTIVE = 2,
  /** Status 3: Vault has been redeemed, BTC is claimable */
  REDEEMED = 3,
  /** Status 4: Vault was liquidated (collateral seized due to unpaid debt) */
  LIQUIDATED = 4,
  /** Status 5: Vault is invalid - BTC UTXOs were spent in a different transaction */
  INVALID = 5,
  /** Status 6: Depositor has withdrawn their BTC (redemption complete) */
  DEPOSITOR_WITHDRAWN = 6,
}

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
 * Backend daemon status (vault provider database)
 * Source: /btc-vault/crates/vaultd/src/workers/claimer/mod.rs PegInStatus enum
 *
 * State flow:
 * PendingBabeSetup -> PendingChallengerPresigning -> PendingDepositorSignatures -> PendingACKs -> PendingActivation -> Activated
 */
export enum DaemonStatus {
  PENDING_DEPOSITOR_LAMPORT_PK = "PendingDepositorLamportPK",
  PENDING_BABE_SETUP = "PendingBabeSetup",
  PENDING_CHALLENGER_PRESIGNING = "PendingChallengerPresigning",
  PENDING_DEPOSITOR_SIGNATURES = "PendingDepositorSignatures",
  PENDING_ACKS = "PendingACKs",
  PENDING_ACTIVATION = "PendingActivation",
  ACTIVATED = "Activated",
  EXPIRED = "Expired",
  CLAIM_POSTED = "ClaimPosted",
  PEGGED_OUT = "PeggedOut",
}

/**
 * States that occur before PendingDepositorSignatures.
 * When vault provider returns these states, frontend should wait/poll.
 */
export const PRE_DEPOSITOR_SIGNATURES_STATES = [
  DaemonStatus.PENDING_BABE_SETUP,
  DaemonStatus.PENDING_DEPOSITOR_LAMPORT_PK,
  DaemonStatus.PENDING_CHALLENGER_PRESIGNING,
] as const;

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
  PROCESSING: "Processing",
  VERIFIED: "Verified",
  PENDING_BITCOIN_CONFIRMATIONS: "Confirming",
  AVAILABLE: "Available",
  IN_USE: "In Use",
  REDEEM_IN_PROGRESS: "Redeem in Progress",
  REDEEMED: "Redeemed",
  LIQUIDATED: "Liquidated",
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
  /** Submit lamport key (re-enter mnemonic) */
  SUBMIT_LAMPORT_KEY = "SUBMIT_LAMPORT_KEY",
  /** Sign payout transactions */
  SIGN_PAYOUT_TRANSACTIONS = "SIGN_PAYOUT_TRANSACTIONS",
  /** Sign and broadcast peg-in transaction to Bitcoin */
  SIGN_AND_BROADCAST_TO_BITCOIN = "SIGN_AND_BROADCAST_TO_BITCOIN",
  /** Redeem (peg-out) */
  REDEEM = "REDEEM",
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
  /** Whether the UTXO for this deposit is no longer available (spent) */
  utxoUnavailable?: boolean;
  /** Whether the vault provider is waiting for the depositor's lamport public key */
  needsLamportKey?: boolean;
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
    utxoUnavailable,
    needsLamportKey,
  } = options;

  // Early check: If UTXO is unavailable (spent), show Invalid state
  // This provides immediate feedback before the backend updates the status
  // Note: Deposits whose txid is detected in broadcastedTxIds are treated as not-unavailable
  // (spending UTXO is expected after broadcast). If broadcastedTxIds is unavailable or
  // doesn't contain the txid, the deposit may still be marked unavailable.
  if (utxoUnavailable) {
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

  // Contract Status 0: Pending (Request submitted, waiting for ACKs)
  if (contractStatus === ContractStatus.PENDING) {
    // Sub-state: Depositor already signed (waiting for on-chain ACK)
    if (localStatus === LocalStorageStatus.PAYOUT_SIGNED) {
      return {
        contractStatus,
        localStatus,
        displayLabel: PEGIN_DISPLAY_LABELS.PROCESSING,
        displayVariant: "pending",
        availableActions: [PeginAction.NONE],
        message:
          "Payout signatures submitted. Waiting for vault provider to collect acknowledgements and update on-chain status...",
      };
    }

    // Sub-state: Vault provider waiting for depositor's lamport public key
    if (needsLamportKey) {
      return {
        contractStatus,
        localStatus,
        displayLabel: PEGIN_DISPLAY_LABELS.SIGNING_REQUIRED,
        displayVariant: "pending",
        availableActions: [PeginAction.SUBMIT_LAMPORT_KEY],
        message:
          "Vault provider is waiting for your Lamport public key. Please enter your mnemonic to continue.",
      };
    }

    // Sub-state: Transactions not ready yet
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

  // Contract Status 1: Verified (All ACKs collected, ready for inclusion proof)
  if (contractStatus === ContractStatus.VERIFIED) {
    // Sub-state: BTC transaction broadcasted (waiting for confirmations)
    if (localStatus === LocalStorageStatus.CONFIRMING) {
      return {
        contractStatus,
        localStatus,
        displayLabel: PEGIN_DISPLAY_LABELS.PENDING_BITCOIN_CONFIRMATIONS,
        displayVariant: "pending",
        availableActions: [PeginAction.NONE],
        message:
          "Bitcoin transaction broadcasted. Waiting for network confirmations...",
      };
    }

    // Ready to broadcast to Bitcoin
    return {
      contractStatus,
      localStatus,
      displayLabel: PEGIN_DISPLAY_LABELS.VERIFIED,
      displayVariant: "pending",
      availableActions: [PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN],
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

    // Vault is active and NOT in use - available for redemption
    return {
      contractStatus,
      localStatus,
      displayLabel: PEGIN_DISPLAY_LABELS.AVAILABLE,
      displayVariant: "active",
      availableActions: [PeginAction.REDEEM],
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
  if (state.availableActions.includes(PeginAction.SUBMIT_LAMPORT_KEY)) {
    return {
      label: "Enter Mnemonic",
      action: PeginAction.SUBMIT_LAMPORT_KEY,
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
      label: "Broadcast",
      action: PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN,
    };
  }

  if (state.availableActions.includes(PeginAction.REDEEM)) {
    return {
      label: "Redeem",
      action: PeginAction.REDEEM,
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
 * - PAYOUT_SIGNED localStorage: useful when contract is PENDING or VERIFIED (user signed, waiting for ACK or broadcast)
 * - CONFIRMING localStorage: useful when contract is VERIFIED (user broadcast BTC, waiting for confirmations)
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
    contractStatus === ContractStatus.DEPOSITOR_WITHDRAWN
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

  // Keep PAYOUT_SIGNED when contract is PENDING or VERIFIED (user needs to broadcast)
  // Keep CONFIRMING when contract is VERIFIED (waiting for BTC confirmations)
  return false;
}
