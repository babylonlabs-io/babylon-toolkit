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
 */
export enum ContractStatus {
  /** Status 0: Request submitted, waiting for ACKs */
  PENDING = 0,
  /** Status 1: All ACKs collected, ready for inclusion proof */
  VERIFIED = 1,
  /** Status 2: Inclusion proof verified, vBTC minted, available for positions */
  AVAILABLE = 2,
  /** Status 3: Vault is being used as collateral in a lending position */
  IN_POSITION = 3,
  /** Status 4: Pegged-in BTC has been liquidated/repaid and burned */
  EXPIRED = 4,
}

/**
 * Local storage status (off-chain, temporary)
 * Used to track user actions before blockchain confirmation
 */
export enum LocalStorageStatus {
  /** Initial state: Peg-in request submitted to contract */
  PENDING = 'pending',
  /** Depositor submitted payout signatures, waiting for on-chain ACK */
  PAYOUT_SIGNED = 'payout_signed',
  /** BTC transaction broadcasted, waiting for confirmations */
  CONFIRMING = 'confirming',
  /** Confirmed on blockchain (should be removed from localStorage) */
  CONFIRMED = 'confirmed',
}

/**
 * Backend daemon status (vault provider database)
 * Source: /btc-vault/crates/vaultd/src/db.rs PegInStatus enum
 */
export enum DaemonStatus {
  PENDING_CHALLENGER_SIGNATURES = 'PendingChallengerSignatures',
  PENDING_DEPOSITOR_SIGNATURES = 'PendingDepositorSignatures',
  ACKNOWLEDGED = 'Acknowledged',
  ACTIVATED = 'Activated',
  CLAIM_POSTED = 'ClaimPosted',
  CHALLENGE_PERIOD = 'ChallengePeriod',
  PEGGED_OUT = 'PeggedOut',
}

// ============================================================================
// Unified State Model
// ============================================================================

/**
 * Unified peg-in state combining all sources
 */
export interface PeginState {
  /** Smart contract status (source of truth for on-chain state) */
  contractStatus: ContractStatus;
  /** Local storage status (temporary, off-chain) */
  localStatus?: LocalStorageStatus;
  /** Display label for UI */
  displayLabel: string;
  /** Display variant for styling */
  displayVariant: 'pending' | 'active' | 'inactive';
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
  /** Sign payout transactions */
  SIGN_PAYOUT_TRANSACTIONS = 'SIGN_PAYOUT_TRANSACTIONS',
  /** Sign and broadcast peg-in transaction to Bitcoin */
  SIGN_AND_BROADCAST_TO_BITCOIN = 'SIGN_AND_BROADCAST_TO_BITCOIN',
  /** Redeem (peg-out) */
  REDEEM = 'REDEEM',
  /** No action available - user must wait */
  NONE = 'NONE',
}

// ============================================================================
// State Machine Logic
// ============================================================================

/**
 * Determine the current state and available actions based on contract and local status
 *
 * @param contractStatus - On-chain contract status (source of truth)
 * @param localStatus - Off-chain localStorage status (temporary)
 * @param transactionsReady - Whether claim/payout transactions are ready from VP
 * @returns Unified peg-in state with available actions
 */
export function getPeginState(
  contractStatus: ContractStatus,
  localStatus?: LocalStorageStatus,
  transactionsReady?: boolean,
): PeginState {
  // Contract Status 0: Pending (Request submitted, waiting for ACKs)
  if (contractStatus === ContractStatus.PENDING) {
    // Sub-state: Depositor already signed (waiting for on-chain ACK)
    if (localStatus === LocalStorageStatus.PAYOUT_SIGNED) {
      return {
        contractStatus,
        localStatus,
        displayLabel: 'Processing',
        displayVariant: 'pending',
        availableActions: [PeginAction.NONE],
        message: 'Payout signatures submitted. Waiting for vault provider to collect acknowledgements and update on-chain status...',
      };
    }

    // Sub-state: Transactions not ready yet
    if (!transactionsReady) {
      return {
        contractStatus,
        localStatus,
        displayLabel: 'Pending',
        displayVariant: 'pending',
        availableActions: [PeginAction.NONE],
        message: 'Waiting for vault provider to prepare Claim and Payout transactions...',
      };
    }

    // Ready to sign payout transactions
    return {
      contractStatus,
      localStatus,
      displayLabel: 'Ready to Sign',
      displayVariant: 'pending',
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
        displayLabel: 'Confirming',
        displayVariant: 'pending',
        availableActions: [PeginAction.NONE],
        message: 'Bitcoin transaction broadcasted. Waiting for network confirmations...',
      };
    }

    // Ready to broadcast to Bitcoin
    return {
      contractStatus,
      localStatus,
      displayLabel: 'Verified',
      displayVariant: 'pending',
      availableActions: [PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN],
    };
  }

  // Contract Status 2: Available (vBTC minted, available for positions)
  if (contractStatus === ContractStatus.AVAILABLE) {
    return {
      contractStatus,
      localStatus,
      displayLabel: 'Available',
      displayVariant: 'active',
      availableActions: [PeginAction.REDEEM],
    };
  }

  // Contract Status 3: InPosition (Vault is being used as collateral)
  if (contractStatus === ContractStatus.IN_POSITION) {
    return {
      contractStatus,
      localStatus,
      displayLabel: 'In Position',
      displayVariant: 'active',
      availableActions: [PeginAction.NONE],
      message: 'Vault is currently being used as collateral in a lending position',
    };
  }

  // Contract Status 4: Expired (Pegged-in BTC has been liquidated/repaid)
  if (contractStatus === ContractStatus.EXPIRED) {
    return {
      contractStatus,
      localStatus,
      displayLabel: 'Expired',
      displayVariant: 'inactive',
      availableActions: [PeginAction.NONE],
      message: 'Vault has been redeemed or liquidated',
    };
  }

  // Fallback: Unknown state
  return {
    contractStatus,
    localStatus,
    displayLabel: 'Unknown',
    displayVariant: 'inactive',
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
  if (state.availableActions.includes(PeginAction.SIGN_PAYOUT_TRANSACTIONS)) {
    return {
      label: 'Sign Payout Transactions',
      action: PeginAction.SIGN_PAYOUT_TRANSACTIONS,
    };
  }

  if (state.availableActions.includes(PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN)) {
    return {
      label: 'Sign & Broadcast to Bitcoin',
      action: PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN,
    };
  }

  if (state.availableActions.includes(PeginAction.REDEEM)) {
    return {
      label: 'Redeem',
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
 */
export function shouldRemoveFromLocalStorage(
  contractStatus: ContractStatus,
  localStatus: LocalStorageStatus,
): boolean {
  // Remove if contract status has progressed beyond local status
  if (contractStatus === ContractStatus.VERIFIED && localStatus === LocalStorageStatus.PAYOUT_SIGNED) {
    return true; // On-chain ACK received, no longer need local flag
  }

  if (contractStatus >= ContractStatus.AVAILABLE) {
    return true; // Fully confirmed (Available/InPosition/Expired), remove from localStorage
  }

  return false;
}

