/**
 * Step 2.5: WOTS public key RPC submission
 *
 * Derives deterministic WOTS block public keys from the depositor's mnemonic
 * and vault-specific inputs (pegin txid, depositor pubkey, app contract
 * address), then submits them to the vault provider via RPC.
 *
 * Note: The WOTS keys are first derived *before* the ETH transaction
 * so their keccak256 hash can be committed on-chain as `depositorWotsPkHash`.
 * This function re-derives the same keys and sends them to the vault
 * provider *after* the ETH transaction is confirmed, since the VP only
 * accepts keys for pegins that are finalized on Ethereum.
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
import { deriveWotsBlockPublicKeys, mnemonicToWotsSeed } from "@/services/wots";
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
 * Derive WOTS block public keys from the mnemonic and submit them to the
 * vault provider via RPC. The VP validates the keys against the keccak256
 * hash committed on-chain during the pegin ETH transaction.
 *
 * Polls `getPeginStatus` first to ensure the VP has ingested the pegin and
 * is ready to accept the WOTS key (status = `PendingDepositorWotsPK`).
 * If the VP has already moved past that status, submission is skipped.
 *
 * @param params - Vault identifiers, provider URL, and a callback to
 *                 retrieve the decrypted mnemonic.
 */
export async function submitWotsPublicKey(
  params: WotsSubmissionParams,
): Promise<void> {
  const {
    peginTxHash,
    depositorBtcPubkey,
    appContractAddress,
    providerAddress,
    getMnemonic,
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

  const mnemonic = await getMnemonic();
  signal?.throwIfAborted();

  const seed = mnemonicToWotsSeed(mnemonic);
  const wotsPublicKeys = await deriveWotsBlockPublicKeys(
    seed,
    peginTxHash,
    depositorBtcPubkey,
    appContractAddress,
  );
  // seed is zeroed inside deriveWotsBlockPublicKeys

  signal?.throwIfAborted();

  const rpcClient = new VaultProviderRpcClient(getVpProxyUrl(providerAddress));

  await rpcClient.submitDepositorWotsKey({
    pegin_txid: stripHexPrefix(peginTxHash),
    depositor_pk: stripHexPrefix(depositorBtcPubkey),
    wots_public_keys: wotsPublicKeys,
  });
}
