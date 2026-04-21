/**
 * Submit pre-derived WOTS public keys to the vault provider.
 *
 * Polls `getPeginStatus` until the VP reaches `PendingDepositorWotsPK`,
 * then submits the keys. If the VP has already moved past WOTS step
 * (e.g., resume flow), submission is skipped.
 *
 * The caller is responsible for deriving WOTS keys externally using
 * `mnemonicToWotsSeed` + `deriveWotsBlockPublicKeys` from the SDK's
 * `tbv/core/wots` module.
 */

import {
  DaemonStatus,
  POST_WOTS_STATUSES,
  type WotsBlockPublicKey,
} from "../../clients/vault-provider/types";
import type { PeginStatusReader, WotsKeySubmitter } from "./interfaces";
import { waitForPeginStatus } from "./waitForPeginStatus";

/** Maximum time to wait for VP to reach PendingDepositorWotsPK (5 min). */
const STATUS_POLL_TIMEOUT_MS = 5 * 60 * 1000;

/** All statuses we accept — either ready for submission or already past it. */
const TARGET_STATUSES: ReadonlySet<DaemonStatus> = new Set([
  DaemonStatus.PENDING_DEPOSITOR_WOTS_PK,
  ...POST_WOTS_STATUSES,
]);

export interface SubmitWotsPublicKeyParams {
  /** VP client implementing the status reader interface */
  statusReader: PeginStatusReader;
  /** VP client implementing the WOTS key submission interface */
  wotsSubmitter: WotsKeySubmitter;
  /** BTC pegin transaction ID (unprefixed hex, 64 chars) */
  peginTxid: string;
  /** Depositor's x-only BTC public key (unprefixed hex, 64 chars) */
  depositorPk: string;
  /** Pre-derived WOTS block public keys (one per assert block) */
  wotsPublicKeys: WotsBlockPublicKey[];
  /** Maximum time to wait for VP to be ready (default: 5 min) */
  timeoutMs?: number;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
}

/**
 * Submit WOTS public keys to the vault provider.
 *
 * @throws Error on timeout, abort, or RPC error
 */
export async function submitWotsPublicKey(
  params: SubmitWotsPublicKeyParams,
): Promise<void> {
  const {
    statusReader,
    wotsSubmitter,
    peginTxid,
    depositorPk,
    wotsPublicKeys,
    timeoutMs = STATUS_POLL_TIMEOUT_MS,
    signal,
  } = params;

  signal?.throwIfAborted();

  // Wait until VP has ingested the pegin and is ready for the WOTS key.
  const status = await waitForPeginStatus({
    statusReader,
    peginTxid,
    targetStatuses: TARGET_STATUSES,
    timeoutMs,
    signal,
  });

  // Key was already submitted in a previous session (e.g. resume flow)
  if (POST_WOTS_STATUSES.has(status)) {
    return;
  }

  signal?.throwIfAborted();

  await wotsSubmitter.submitDepositorWotsKey(
    {
      pegin_txid: peginTxid,
      depositor_pk: depositorPk,
      wots_public_keys: wotsPublicKeys,
    },
    signal,
  );
}
