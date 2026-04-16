/**
 * Step 2.5: WOTS public key RPC submission
 *
 * Submits pre-derived WOTS block public keys to the vault provider via RPC.
 * The caller is responsible for deriving the keys (from mnemonic or any other
 * source) before calling this function.
 *
 * The VP validates the keys against the keccak256 hash committed on-chain
 * during the pegin ETH transaction (`depositorWotsPkHash`).
 *
 * Also used by the "resume deposit" flow when a user returns after closing
 * the app before the RPC submission completed.
 */

import {
  DaemonStatus,
  POST_WOTS_STATUSES,
  VaultProviderRpcClient,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";

import { waitForPeginStatus } from "@/services/vault/vaultPeginStatusService";
import { stripHexPrefix } from "@/utils/btc";
import { getVpProxyUrl } from "@/utils/rpc";

import type { WotsSubmissionParams } from "./types";

/** Maximum time to wait for VP to reach PendingDepositorWotsPK (5 min). */
const STATUS_POLL_TIMEOUT_MS = 5 * 60 * 1000;

/** All statuses we accept — either ready for submission or already past it. */
const TARGET_STATUSES: ReadonlySet<DaemonStatus> = new Set([
  DaemonStatus.PENDING_DEPOSITOR_WOTS_PK,
  ...POST_WOTS_STATUSES,
]);

/**
 * Submit pre-derived WOTS block public keys to the vault provider via RPC.
 *
 * Polls `getPeginStatus` first to ensure the VP has ingested the pegin and
 * is ready to accept the WOTS key (status = `PendingDepositorWotsPK`).
 * If the VP has already moved past that status, submission is skipped.
 *
 * @param params - Vault identifiers, provider URL, and pre-derived WOTS keys.
 */
export async function submitWotsPublicKey(
  params: WotsSubmissionParams,
): Promise<void> {
  const {
    peginTxHash,
    depositorBtcPubkey,
    providerAddress,
    wotsPublicKeys,
    signal,
  } = params;

  signal?.throwIfAborted();

  // Wait until VP has ingested the pegin and is ready for the WOTS key.
  const status = await waitForPeginStatus({
    providerAddress,
    peginTxHash,
    targetStatuses: TARGET_STATUSES,
    timeoutMs: STATUS_POLL_TIMEOUT_MS,
    signal,
  });

  // Key was already submitted in a previous session (e.g. resume flow)
  if (POST_WOTS_STATUSES.has(status as DaemonStatus)) {
    return;
  }

  signal?.throwIfAborted();

  const rpcClient = new VaultProviderRpcClient(getVpProxyUrl(providerAddress));

  await rpcClient.submitDepositorWotsKey({
    pegin_txid: stripHexPrefix(peginTxHash),
    depositor_pk: stripHexPrefix(depositorBtcPubkey),
    wots_public_keys: wotsPublicKeys,
  });
}
