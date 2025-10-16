/**
 * Vault state management utilities
 *
 * Centralizes the logic for determining vault states based on peginRequest
 * and optional vault data from getVaultMetadata.
 */

import type { VaultActivity } from '../mockData/vaultActivities';
import type { ActivityCardActionButton } from '@babylonlabs-io/core-ui';

/**
 * Enum representing all possible vault states
 *
 * States are based on the combination of:
 * - PeginRequest status (0=Pending, 1=Verified, 2=Active)
 * - Vault data from getVaultMetadata (morphoPosition with borrowShares)
 * - Vault metadata active flag
 */
export enum VaultState {
  /** PeginRequest status 0 - waiting for vault provider verification */
  PENDING = 'PENDING',

  /** PeginRequest status 1 - verified but not yet active */
  VERIFIED = 'VERIFIED',

  /** PeginRequest status 2 (Active) with no vault data - ready to mint and borrow */
  READY_TO_BORROW = 'READY_TO_BORROW',

  /** Has morphoPosition with borrowShares > 0 - actively borrowing */
  BORROWING = 'BORROWING',

  /** Vault repaid and closed - BTC withdrawn */
  CLOSED = 'CLOSED',
}

/**
 * Determine the current state of a vault activity
 *
 * @param activity - VaultActivity containing peginRequest and optional vault data
 * @returns VaultState enum representing the current state
 */
export function getVaultState(activity: VaultActivity): VaultState {
  // Check if user has active borrow (has morphoPosition with borrowShares > 0)
  const hasBorrowed = !!activity.morphoPosition && activity.morphoPosition.borrowShares > 0n;

  if (hasBorrowed) {
    return VaultState.BORROWING;
  }

  // Check peginRequest status from activity.status.variant
  const statusVariant = activity.status.variant;

  if (statusVariant === 'pending') {
    // Could be either status 0 (Pending) or 1 (Verified)
    // Check the label to distinguish
    if (activity.status.label === 'Verified') {
      return VaultState.VERIFIED;
    }
    return VaultState.PENDING;
  }

  if (statusVariant === 'active') {
    // PeginRequest is active (status 2) and no vault data yet
    return VaultState.READY_TO_BORROW;
  }

  // Default fallback - treat as pending
  return VaultState.PENDING;
}

/**
 * Get the primary action button configuration for a given vault state
 *
 * @param state - Current VaultState
 * @param activity - VaultActivity for callback context
 * @param onBorrow - Callback for borrow action
 * @param onRepay - Callback for repay action
 * @param onBroadcast - Callback for BTC broadcast action (verified vaults)
 * @returns ActivityCardActionButton config or undefined if no action available
 */
export function getActionForState(
  state: VaultState,
  activity: VaultActivity,
  onBorrow: (activity: VaultActivity) => void,
  onRepay: (activity: VaultActivity) => void,
  onBroadcast?: (activity: VaultActivity) => void
): ActivityCardActionButton | undefined {
  switch (state) {
    case VaultState.BORROWING:
      // User has active borrow - show repay button
      return {
        label: 'Repay and Withdraw BTC',
        onClick: () => onRepay(activity),
        variant: 'outlined',
        fullWidth: true,
      };

    case VaultState.READY_TO_BORROW:
      // Vault is active and ready to borrow
      return {
        label: 'Borrow USDC',
        onClick: () => onBorrow(activity),
        variant: 'outlined',
        fullWidth: true,
      };

    case VaultState.VERIFIED:
      // Vault provider has ACKed, ready for BTC broadcast
      if (onBroadcast) {
        return {
          label: 'Broadcast to Bitcoin',
          onClick: () => onBroadcast(activity),
          variant: 'contained',
          fullWidth: true,
        };
      }
      return undefined;

    case VaultState.CLOSED:
      // Vault is closed - no action available
      return undefined;

    case VaultState.PENDING:
      // No action available for pending vaults
      return undefined;

    default:
      return undefined;
  }
}
