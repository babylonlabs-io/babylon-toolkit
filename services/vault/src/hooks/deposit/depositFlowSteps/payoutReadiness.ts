import {
  DaemonStatus,
  VP_TERMINAL_FAILURE_STATUSES,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";

import {
  type BatchReadinessResult,
  type BatchReadinessStatus,
  type BatchReadinessVault,
  waitForBatchReadiness,
} from "./batchReadiness";

const DEFAULT_PAYOUT_READY_TIMEOUT_MS = 3 * 60 * 1000;

const POST_PAYOUT_STATUSES: ReadonlySet<DaemonStatus> = new Set([
  DaemonStatus.PENDING_ACKS,
  DaemonStatus.PENDING_ACTIVATION,
  DaemonStatus.ACTIVATED_PENDING_BROADCAST,
  DaemonStatus.ACTIVATED,
]);

export interface WaitForPayoutReadinessParams {
  vaults: BatchReadinessVault[];
  providerAddress: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  pollIntervalMs?: number;
}

export type PayoutReadinessResult = BatchReadinessResult;

function classifyPayoutReadinessStatus(
  status: DaemonStatus,
): BatchReadinessStatus {
  if (
    status === DaemonStatus.PENDING_DEPOSITOR_SIGNATURES ||
    POST_PAYOUT_STATUSES.has(status)
  ) {
    return "ready";
  }
  if (
    status === DaemonStatus.EXPIRED ||
    VP_TERMINAL_FAILURE_STATUSES.has(status)
  ) {
    return "terminal";
  }
  return "waiting";
}

export async function waitForPayoutReadiness({
  vaults,
  providerAddress,
  signal,
  timeoutMs = DEFAULT_PAYOUT_READY_TIMEOUT_MS,
  pollIntervalMs,
}: WaitForPayoutReadinessParams): Promise<PayoutReadinessResult> {
  return waitForBatchReadiness({
    vaults,
    providerAddress,
    classifyStatus: classifyPayoutReadinessStatus,
    logLabel: "Payout readiness",
    signal,
    timeoutMs,
    pollIntervalMs,
  });
}

export function isPayoutReadinessTimeout(error: unknown): boolean {
  // Backstop for the SDK's current waitForPeginStatus timeout text. The payout
  // readiness gate should avoid this path; keep this narrow so real signing
  // errors still surface as payout failures.
  return (
    error instanceof Error &&
    error.message.includes("Polling timeout") &&
    error.message.includes("PendingDepositorSignatures")
  );
}
