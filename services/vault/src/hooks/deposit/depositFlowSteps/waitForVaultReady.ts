/**
 * Read-only readiness waits for split-deposit orchestration.
 *
 * The live flow processes sibling vaults in the order the VP makes them ready
 * (concurrent waits, serialized signing) so a slow vault never starves a ready
 * one. These waiters poll the UNAUTHENTICATED `getPeginStatus` only — no wallet
 * interaction — so they are safe to run for every sibling at once. The signing
 * steps (`submitWotsPublicKey`, `signAndSubmitPayouts`) re-check authoritatively
 * and run one at a time.
 *
 * Target sets mirror the SDK signing functions exactly so "ready" here means the
 * subsequent sign call won't block: WOTS mirrors `submitWotsPublicKey`'s targets;
 * payout mirrors `runDepositorPresignFlow`'s `{PendingDepositorSignatures} ∪
 * POST_PAYOUT_SIGNATURE_STATUSES`. Timeouts match those functions so the waiter
 * never gives up before the authoritative call would.
 */

import { stripHexPrefix } from "@babylonlabs-io/ts-sdk/tbv/core";
import {
  DaemonStatus,
  POST_PAYOUT_SIGNATURE_STATUSES,
  POST_WOTS_STATUSES,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { waitForPeginStatus } from "@babylonlabs-io/ts-sdk/tbv/core/services";

import { createVpClient } from "@/utils/rpc/vpClient";

/** Matches `submitWotsPublicKey` STATUS_POLL_TIMEOUT_MS. */
const WOTS_READY_TIMEOUT_MS = 5 * 60 * 1000;
/** Matches `runDepositorPresignFlow` MAX_POLLING_TIMEOUT_MS. */
const PAYOUT_READY_TIMEOUT_MS = 20 * 60 * 1000;

const WOTS_READY_STATUSES: ReadonlySet<DaemonStatus> = new Set([
  DaemonStatus.PENDING_DEPOSITOR_WOTS_PK,
  ...POST_WOTS_STATUSES,
]);

const PAYOUT_READY_STATUSES: ReadonlySet<DaemonStatus> = new Set([
  DaemonStatus.PENDING_DEPOSITOR_SIGNATURES,
  ...POST_PAYOUT_SIGNATURE_STATUSES,
]);

interface WaitForVaultReadyParams {
  peginTxHash: string;
  providerAddress: string;
  signal?: AbortSignal;
}

/** Resolve once the VP is ready to accept this vault's WOTS key (or past it). */
export function waitForWotsReady({
  peginTxHash,
  providerAddress,
  signal,
}: WaitForVaultReadyParams): Promise<void> {
  return waitForPeginStatus({
    statusReader: createVpClient(providerAddress),
    peginTxid: stripHexPrefix(peginTxHash),
    targetStatuses: WOTS_READY_STATUSES,
    timeoutMs: WOTS_READY_TIMEOUT_MS,
    signal,
  }).then(() => undefined);
}

/** Resolve once the VP has presign transactions ready for this vault (or past it). */
export function waitForPayoutReady({
  peginTxHash,
  providerAddress,
  signal,
}: WaitForVaultReadyParams): Promise<void> {
  return waitForPeginStatus({
    statusReader: createVpClient(providerAddress),
    peginTxid: stripHexPrefix(peginTxHash),
    targetStatuses: PAYOUT_READY_STATUSES,
    timeoutMs: PAYOUT_READY_TIMEOUT_MS,
    signal,
  }).then(() => undefined);
}
