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

// ============================================================================
// Protocol State Model
// ============================================================================

/**
 * Available actions user can take
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
}

/**
 * Protocol-level peg-in state (framework-agnostic)
 */
export interface PeginProtocolState {
  /** Smart contract status (source of truth for on-chain state) */
  contractStatus: ContractStatus;
  /** Available user actions (empty array when no action is available) */
  availableActions: PeginAction[];
}

/**
 * Options for getPeginProtocolState function.
 *
 * All fields represent protocol-level state from the vault provider or
 * on-chain contracts. Client-side tracking (localStorage, polling state)
 * is NOT included — consumers handle that in their own layer.
 */
export interface GetPeginProtocolStateOptions {
  /** Whether claim/payout transactions are ready from VP */
  transactionsReady?: boolean;
  /** Whether the vault provider is waiting for the depositor's WOTS public key */
  needsWotsKey?: boolean;
  /** Whether the vault provider hasn't ingested this peg-in yet */
  pendingIngestion?: boolean;
  /** Whether the depositor can refund the HTLC (Pre-PegIn tx available) */
  canRefund?: boolean;
  /** Whether the vault provider reported a terminal failure */
  hasProviderTerminalFailure?: boolean;
}

// ============================================================================
// State Machine Logic
// ============================================================================

/**
 * Determine the current protocol state and available actions based on contract
 * status and vault provider state. Framework-agnostic: returns only
 * protocol-level data with no display labels, messages, or UI concerns.
 *
 * Client-side tracking overrides (e.g. suppressing actions after the user
 * has already acted but on-chain state hasn't caught up) are the caller's
 * responsibility.
 *
 * @param contractStatus - On-chain contract status (source of truth)
 * @param options - Vault provider state
 * @returns Protocol state with available actions
 */
export function getPeginProtocolState(
  contractStatus: ContractStatus,
  options: GetPeginProtocolStateOptions = {},
): PeginProtocolState {
  const {
    transactionsReady,
    needsWotsKey,
    pendingIngestion,
    canRefund,
    hasProviderTerminalFailure,
  } = options;

  if (contractStatus === ContractStatus.PENDING) {
    if (hasProviderTerminalFailure) {
      return { contractStatus, availableActions: [] };
    }

    if (needsWotsKey) {
      return {
        contractStatus,
        availableActions: [PeginAction.SUBMIT_WOTS_KEY],
      };
    }

    if (pendingIngestion === true && !transactionsReady) {
      return {
        contractStatus,
        availableActions: [PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN],
      };
    }

    if (pendingIngestion === undefined && !transactionsReady) {
      return { contractStatus, availableActions: [] };
    }

    if (!transactionsReady) {
      return { contractStatus, availableActions: [] };
    }

    return {
      contractStatus,
      availableActions: [PeginAction.SIGN_PAYOUT_TRANSACTIONS],
    };
  }

  if (contractStatus === ContractStatus.VERIFIED) {
    return {
      contractStatus,
      availableActions: [PeginAction.ACTIVATE_VAULT],
    };
  }

  if (contractStatus === ContractStatus.ACTIVE) {
    return { contractStatus, availableActions: [] };
  }

  if (contractStatus === ContractStatus.REDEEMED) {
    return { contractStatus, availableActions: [] };
  }

  if (contractStatus === ContractStatus.LIQUIDATED) {
    return { contractStatus, availableActions: [] };
  }

  if (contractStatus === ContractStatus.EXPIRED) {
    return {
      contractStatus,
      availableActions: canRefund ? [PeginAction.REFUND_HTLC] : [],
    };
  }

  if (contractStatus === ContractStatus.INVALID) {
    return { contractStatus, availableActions: [] };
  }

  if (contractStatus === ContractStatus.DEPOSITOR_WITHDRAWN) {
    return { contractStatus, availableActions: [] };
  }

  return { contractStatus, availableActions: [] };
}

/**
 * Check if a specific action is available in the current state
 */
export function canPerformAction(
  state: PeginProtocolState,
  action: PeginAction,
): boolean {
  return state.availableActions.includes(action);
}
