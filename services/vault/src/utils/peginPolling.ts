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

/** Polling error tagged with the daemon status that produced it. */
export class TerminalPeginPollingError extends Error {
  readonly daemonStatus: DaemonStatus;
  constructor(daemonStatus: DaemonStatus, message: string) {
    super(message);
    this.name = "TerminalPeginPollingError";
    this.daemonStatus = daemonStatus;
  }
}

// EXPIRED is grace-window interim — refund path remains; polling can stop.
function isTerminalDaemonStatus(status: DaemonStatus): boolean {
  return (
    VP_TERMINAL_FAILURE_STATUSES.has(status) || status === DaemonStatus.EXPIRED
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

/**
 * Identify which deposits need polling based on their status
 *
 * Criteria: PENDING contract status, not yet signed, have required data
 */
export function getDepositsNeedingPolling(
  activities: VaultActivity[],
  pendingPegins: PendingPeginRequest[],
  btcPublicKey?: string,
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
        !!btcPublicKey &&
        !!vaultProviderAddress &&
        !!activity.peginTxHash &&
        !!activity.applicationEntryPoint &&
        isVaultOwnedByWallet(activity.depositorBtcPubkey, btcPublicKey);

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
