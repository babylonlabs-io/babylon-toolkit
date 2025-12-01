/**
 * Types for Peg-In Polling Context
 */

import type { PropsWithChildren } from "react";

import type {
  LocalStorageStatus,
  PeginState,
} from "../models/peginStateMachine";
import type { PendingPeginRequest } from "../storage/peginStorage";
import type { ClaimerTransactions, VaultProvider } from "../types";
import type { VaultActivity } from "../types/activity";

/** Result of polling for a single deposit */
export interface DepositPollingResult {
  /** Deposit/activity ID (txHash) */
  depositId: string;
  /** Claim and payout transactions (null if not ready) */
  transactions: ClaimerTransactions[] | null;
  /** Whether transactions are ready for signing */
  isReady: boolean;
  /** Loading state for this deposit */
  loading: boolean;
  /** Error state for this deposit */
  error: Error | null;
  /** Current state from pegin state machine */
  peginState: PeginState;
}

/** Context value type */
export interface PeginPollingContextValue {
  /** Get polling result for a specific deposit */
  getPollingResult: (depositId: string) => DepositPollingResult | undefined;
  /** Global loading state (any deposit is loading) */
  isLoading: boolean;
  /** Trigger a manual refetch for all deposits */
  refetch: () => void;
  /** Optimistically update the local status for a deposit (immediate UI feedback) */
  setOptimisticStatus: (
    depositId: string,
    newStatus: LocalStorageStatus,
  ) => void;
  /** Clear optimistic status (after actual data refresh) */
  clearOptimisticStatus: (depositId: string) => void;
}

/** Provider props */
export interface PeginPollingProviderProps extends PropsWithChildren {
  /** All activities to potentially poll */
  activities: VaultActivity[];
  /** Pending pegins from localStorage */
  pendingPegins: PendingPeginRequest[];
  /** Depositor's BTC public key (x-only, 32 bytes without 0x prefix) */
  btcPublicKey?: string;
  /** Vault providers data (pre-fetched at page level) */
  vaultProviders: VaultProvider[];
}

/** Deposit prepared for polling */
export interface DepositToPoll {
  activity: VaultActivity;
  pendingPegin: PendingPeginRequest | undefined;
  shouldPoll: boolean;
  vaultProviderAddress: string | undefined;
}

/** Grouped deposits by provider URL */
export interface DepositsByProvider {
  providerUrl: string;
  deposits: DepositToPoll[];
}
