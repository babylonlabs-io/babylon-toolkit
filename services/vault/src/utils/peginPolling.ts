/**
 * Utility functions for Peg-In Polling
 */

import {
  DaemonStatus,
  VP_TERMINAL_FAILURE_STATUSES,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import type { Hex } from "viem";

import { ContractStatus } from "../models/peginStateMachine";
import type { PendingPeginRequest } from "../storage/peginStorage";
import type { VaultActivity } from "../types/activity";
import type { DepositsByProvider, DepositToPoll } from "../types/peginPolling";

import { isVaultOwnedByWallet } from "./vaultWarnings";

// ============================================================================
// Terminal Error Detection
// ============================================================================

/**
 * Stands in for a VP status the SDK does not recognize. The raw status is
 * VP-controlled, so it never reaches telemetry tags.
 */
export const UNRECOGNIZED_DAEMON_STATUS = "Unrecognized";

export type PollingDaemonStatus =
  | DaemonStatus
  | typeof UNRECOGNIZED_DAEMON_STATUS;

/** Polling error tagged with the daemon status that produced it. */
export class TerminalPeginPollingError extends Error {
  readonly daemonStatus: PollingDaemonStatus;
  constructor(daemonStatus: PollingDaemonStatus, message: string) {
    super(message);
    this.name = "TerminalPeginPollingError";
    this.daemonStatus = daemonStatus;
  }
}

// EXPIRED is grace-window interim — refund path remains; polling can stop.
// An unrecognized status stops polling too: the app has no rule for it.
function isTerminalDaemonStatus(status: PollingDaemonStatus): boolean {
  return (
    status === UNRECOGNIZED_DAEMON_STATUS ||
    status === DaemonStatus.EXPIRED ||
    VP_TERMINAL_FAILURE_STATUSES.has(status)
  );
}

// VP rpc/error.rs `RpcError::UnauthorizedDepositor` — arrives as a plain
// Error (JSON-RPC -32001 envelope), not a daemon-status, so it bypasses
// the TerminalPeginPollingError path. Fail-fast here so a wrong-wallet
// pairing doesn't hang the UI on indefinite polling.
const UNAUTHORIZED_DEPOSITOR_PATTERN = "Unauthorized depositor";

export function isTerminalPollingError(error: unknown): boolean {
  if (
    error instanceof TerminalPeginPollingError &&
    isTerminalDaemonStatus(error.daemonStatus)
  ) {
    return true;
  }
  return (
    error instanceof Error &&
    error.message.includes(UNAUTHORIZED_DEPOSITOR_PATTERN)
  );
}

// VP rpc/error.rs `RpcError::PegInNotFound` — the VP has no row for the
// vault yet. Matched as a prefix: a validator error that quotes VP text
// starts with its own prefix, so it never reads as not-ingested.
const PEGIN_NOT_FOUND_ERROR_PREFIX = "PegIn not found";

/** Whether a batch item error means the VP has not ingested the peg-in yet. */
export function isPeginNotIngestedError(error: string): boolean {
  return error.startsWith(PEGIN_NOT_FOUND_ERROR_PREFIX);
}

/**
 * Decide whether the current wallet state polls a deposit's vault provider
 * status.
 *
 * With a key, only the deposits signed by that key poll. Without a key,
 * every deposit polls when Bitcoin is absent (Ethereum-only session) and
 * none polls while Bitcoin is connected but its key is still loading or
 * failed - the same as before Ethereum-only access existed.
 */
function shouldPollForWallet(
  depositorBtcPubkey: string | undefined,
  btcPublicKey: string | undefined,
  btcWalletAbsent: boolean,
): boolean {
  return btcPublicKey
    ? isVaultOwnedByWallet(depositorBtcPubkey, btcPublicKey)
    : btcWalletAbsent;
}

/**
 * Identify which deposits need polling based on their status
 *
 * Criteria: PENDING contract status, not yet signed, have required data
 */
export function getDepositsNeedingPolling(
  activities: VaultActivity[],
  pendingPegins: PendingPeginRequest[],
  btcPublicKey?: string,
  btcWalletAbsent = false,
): DepositToPoll[] {
  return activities
    .map((activity) => {
      const pendingPegin = pendingPegins.find((p) => p.id === activity.id);
      const contractStatus = (activity.contractStatus ?? 0) as ContractStatus;
      // Note: Currently only single vault provider per deposit is supported
      const vaultProviderAddress = activity.providers[0]?.id as Hex | undefined;

      // Check if this deposit should be polled
      const shouldPoll =
        contractStatus === ContractStatus.PENDING &&
        !!vaultProviderAddress &&
        !!activity.peginTxHash &&
        !!activity.applicationEntryPoint &&
        shouldPollForWallet(
          activity.depositorBtcPubkey,
          btcPublicKey,
          btcWalletAbsent,
        );

      return {
        activity,
        pendingPegin,
        shouldPoll,
        vaultProviderAddress,
      };
    })
    .filter((d) => d.shouldPoll);
}

/**
 * Group deposits by vault provider for batched RPC calls via the proxy
 */
export function groupDepositsByProvider(
  depositsToPoll: DepositToPoll[],
): Map<string, DepositsByProvider> {
  const grouped = new Map<string, DepositsByProvider>();

  for (const deposit of depositsToPoll) {
    const providerAddress = deposit.vaultProviderAddress;
    if (!providerAddress || !providerAddress.startsWith("0x")) continue;

    const existing = grouped.get(providerAddress);
    if (existing) {
      existing.deposits.push(deposit);
    } else {
      grouped.set(providerAddress, {
        providerAddress,
        deposits: [deposit],
      });
    }
  }

  return grouped;
}
