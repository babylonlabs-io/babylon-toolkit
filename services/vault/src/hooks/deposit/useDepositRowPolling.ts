/**
 * useDepositRowPolling Hook
 *
 * Provides row-level polling for payout transactions.
 * This hook is called at the table row level and persists even when modal is closed.
 *
 * Purpose:
 * - Poll vault provider RPC for claim/payout transactions
 * - Determine if "Sign" button should be shown
 * - Provide transaction data when ready for signing
 * - Works independently per row (multiple deposits can poll simultaneously)
 */

import { useMemo } from "react";
import type { Hex } from "viem";

import {
  ContractStatus,
  LocalStorageStatus,
  PeginAction,
  getPeginState,
} from "../../models/peginStateMachine";
import type { PendingPeginRequest } from "../../storage/peginStorage";
import type { VaultActivity } from "../../types/activity";

import { usePendingPeginTxPolling } from "./usePendingPeginTxPolling";

export interface UseDepositRowPollingParams {
  /** The vault activity/deposit to poll for */
  activity: VaultActivity;
  /** Depositor's BTC public key (x-only, 32 bytes without 0x prefix) */
  btcPublicKey?: string;
  /** Pending pegin data from localStorage (if exists) */
  pendingPegin?: PendingPeginRequest;
}

export interface UseDepositRowPollingResult {
  /** Claim and payout transactions (null if not ready) */
  transactions: any[] | null;
  /** Loading state */
  loading: boolean;
  /** Error state */
  error: Error | null;
  /** Whether transactions are ready for signing */
  isReady: boolean;
  /** Current pegin state from state machine */
  peginState: ReturnType<typeof getPeginState>;
  /** Whether to show "Sign" button in table */
  shouldShowSignButton: boolean;
  /** Whether to show "Broadcast" button in table */
  shouldShowBroadcastButton: boolean;
  /** Contract status for the deposit */
  contractStatus: ContractStatus;
  /** Local storage status (if any) */
  localStatus?: LocalStorageStatus;
}

/**
 * Hook to poll for payout transactions at table row level
 *
 * This hook enables polling to persist outside the modal:
 * - Polls when contractStatus = 0 (PENDING) and payouts not yet signed
 * - Stops polling when transactions ready OR status changes
 * - Provides state machine state for button display
 *
 * @param params - Row polling parameters
 * @returns Polling result and state machine state
 */
export function useDepositRowPolling(
  params: UseDepositRowPollingParams,
): UseDepositRowPollingResult {
  const { activity, btcPublicKey, pendingPegin } = params;

  const contractStatus = (activity.contractStatus ?? 0) as ContractStatus;
  const localStatus = pendingPegin?.status as LocalStorageStatus | undefined;
  // Note: Currently only single vault provider per deposit is supported
  const vaultProviderAddress = activity.providers[0]?.id as Hex | undefined;

  // Determine if should poll for payout transactions
  // Poll when: PENDING status, not yet signed, have required data
  const shouldPoll = useMemo(() => {
    return (
      contractStatus === ContractStatus.PENDING &&
      localStatus !== LocalStorageStatus.PAYOUT_SIGNED &&
      !!btcPublicKey &&
      !!vaultProviderAddress &&
      !!activity.txHash
    );
  }, [
    contractStatus,
    localStatus,
    btcPublicKey,
    vaultProviderAddress,
    activity.txHash,
  ]);

  // Poll vault provider RPC for claim/payout transactions
  const { transactions, loading, error, isReady } = usePendingPeginTxPolling(
    shouldPoll && activity.applicationController
      ? {
          peginTxId: activity.txHash!,
          vaultProviderAddress: vaultProviderAddress!,
          depositorBtcPubkey: btcPublicKey!,
          applicationController: activity.applicationController,
        }
      : null,
  );

  // Get current state from state machine
  const peginState = useMemo(
    () =>
      getPeginState(contractStatus, {
        localStatus,
        transactionsReady: isReady,
        isInUse: activity.isInUse,
      }),
    [contractStatus, localStatus, isReady, activity.isInUse],
  );

  // Determine if "Sign" button should be shown
  const shouldShowSignButton = useMemo(
    () =>
      peginState.availableActions.includes(
        PeginAction.SIGN_PAYOUT_TRANSACTIONS,
      ),
    [peginState.availableActions],
  );

  // Determine if "Broadcast" button should be shown
  const shouldShowBroadcastButton = useMemo(
    () =>
      peginState.availableActions.includes(
        PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN,
      ),
    [peginState.availableActions],
  );

  return {
    transactions,
    loading,
    error,
    isReady,
    peginState,
    shouldShowSignButton,
    shouldShowBroadcastButton,
    contractStatus,
    localStatus,
  };
}
