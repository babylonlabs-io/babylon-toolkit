/**
 * Types for Peg-In Polling Context
 */

import type { PropsWithChildren } from "react";

import type { DepositFlowStep } from "../hooks/deposit/depositFlowSteps/types";
import type {
  LocalStorageStatus,
  PeginState,
} from "../models/peginStateMachine";
import type { PendingPeginRequest } from "../storage/peginStorage";
import type { VaultActivity } from "../types/activity";

/** Result of polling for a single deposit */
export interface DepositPollingResult {
  /** Deposit/activity ID (txHash) */
  depositId: string;
  /** Loading state for this deposit */
  loading: boolean;
  /** Error state for this deposit */
  error: Error | null;
  /** Current state from pegin state machine */
  peginState: PeginState;
  /** Whether the vault is owned by the currently connected BTC wallet */
  isOwnedByCurrentWallet: boolean;
  /**
   * The vault's depositor BTC public key, surfaced so the UI can identify
   * which wallet created this vault when the ownership check fails.
   * Undefined only for legacy/incomplete indexer data.
   */
  depositorBtcPubkey: string | undefined;
  /**
   * Live Pre-PegIn confirmation count from mempool polling. `null` when the
   * first poll hasn't returned yet (or the deposit isn't in the poll set).
   * Cached observations past `requiredPrePeginDepth` are coalesced into this
   * value via `confirmedTxids`, so callers can compare against
   * `requiredPrePeginDepth` directly.
   */
  prePeginConfirmations: number | null;
  /** Protocol-required confirmation depth (`minPrepeginDepth`) for this vault. */
  requiredPrePeginDepth: number;
  /**
   * Forces the card's displayed progress step instead of deriving it from
   * `peginState`. Undefined on every production path — used only by the dev
   * god-mode panel to mock arbitrary deposit-flow steps (1–15).
   */
  displayStepOverride?: DepositFlowStep;
}

/** Context value type */
export interface PeginPollingContextValue {
  /** Get polling result for a specific deposit */
  getPollingResult: (depositId: string) => DepositPollingResult | undefined;
  /** Global loading state (any deposit is loading) */
  isLoading: boolean;
  /** Trigger a manual refetch for all deposits */
  refetch: () => void;
  /**
   * Optimistically update the local status for a deposit (immediate UI
   * feedback). When transitioning to REFUND_BROADCAST, pass
   * `refundBroadcastAt` so the suppression-TTL anchor is available before
   * `pendingPegins` is re-read from localStorage.
   */
  setOptimisticStatus: (
    depositId: string,
    newStatus: LocalStorageStatus,
    refundBroadcastAt?: number,
  ) => void;
  /** Clear optimistic status (after actual data refresh) */
  clearOptimisticStatus: (depositId: string) => void;
  /**
   * Mark a vault's HTLC refund as confirmed-settled: persist it to the
   * refunded-HTLC cache AND update the in-memory set, so the dashboard shows
   * "Refunded" immediately in-session — not only after a reload/next poll.
   */
  addConfirmedRefund: (depositId: string) => void;
}

/** Provider props */
export interface PeginPollingProviderProps extends PropsWithChildren {
  /** All activities to potentially poll */
  activities: VaultActivity[];
  /** Pending pegins from localStorage */
  pendingPegins: PendingPeginRequest[];
  /** Depositor's BTC public key (x-only, 32 bytes without 0x prefix) */
  btcPublicKey?: string;
}

/** Deposit prepared for polling */
export interface DepositToPoll {
  activity: VaultActivity;
  pendingPegin: PendingPeginRequest | undefined;
  shouldPoll: boolean;
  vaultProviderAddress: string | undefined;
}

/** Grouped deposits by vault provider address */
export interface DepositsByProvider {
  providerAddress: string;
  deposits: DepositToPoll[];
}
