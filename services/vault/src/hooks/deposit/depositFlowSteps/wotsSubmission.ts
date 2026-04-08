/**
 * Step 2.5: WOTS public key RPC submission
 *
 * Derives a deterministic WOTS keypair from the depositor's mnemonic
 * and vault-specific inputs (pegin txid, depositor pubkey, app contract
 * address), then submits the full public key to the vault provider via RPC.
 *
 * Note: The WOTS keypair is first derived *before* the ETH transaction
 * so its keccak256 hash can be committed on-chain as `depositorWotsPkHash`.
 * This function re-derives the same keypair and sends the full public key
 * to the vault provider *after* the ETH transaction is confirmed, since the
 * VP only accepts keys for pegins that are finalized on Ethereum.
 *
 * Also used by the "resume deposit" flow when a user returns after closing
 * the app before the RPC submission completed.
 */

import { VaultProviderRpcApi } from "@/clients/vault-provider-rpc";
import { DaemonStatus } from "@/models/peginStateMachine";
import { waitForPeginStatus } from "@/services/vault/vaultPeginStatusService";
import {
  deriveWotsKeypair,
  keypairToPublicKey,
  mnemonicToWotsSeed,
} from "@/services/wots";
import { stripHexPrefix } from "@/utils/btc";
import { getVpProxyUrl } from "@/utils/rpc";

import type { WotsSubmissionParams } from "./types";

/** Timeout for the WOTS key submission RPC call. */
const RPC_TIMEOUT_MS = 60 * 1000;

/** Maximum time to wait for VP to reach PendingDepositorWotsPK (5 min). */
const STATUS_POLL_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Statuses that come after WOTS key submission.
 * If the VP is already in one of these states, the key was already submitted
 * (e.g. via resume flow) and we can skip.
 */
const POST_WOTS_STATUSES = new Set<string>([
  DaemonStatus.PENDING_BABE_SETUP,
  DaemonStatus.PENDING_CHALLENGER_PRESIGNING,
  DaemonStatus.PENDING_PEGIN_SIGS_AVAILABILITY,
  DaemonStatus.PENDING_DEPOSITOR_SIGNATURES,
  DaemonStatus.PENDING_ACKS,
  DaemonStatus.PENDING_ACTIVATION,
  DaemonStatus.ACTIVATED,
]);

/** All statuses we accept — either ready for submission or already past it. */
const TARGET_STATUSES = new Set<string>([
  DaemonStatus.PENDING_DEPOSITOR_WOTS_PK,
  ...POST_WOTS_STATUSES,
]);

/**
 * Derive a WOTS keypair from the mnemonic and submit the full public
 * key to the vault provider via RPC. The VP validates the key against the
 * keccak256 hash committed on-chain during the pegin ETH transaction.
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
  if (POST_WOTS_STATUSES.has(status)) {
    return;
  }

  const mnemonic = await getMnemonic();
  signal?.throwIfAborted();

  const seed = mnemonicToWotsSeed(mnemonic);
  let wotsPublicKey: ReturnType<typeof keypairToPublicKey>;
  try {
    const keypair = await deriveWotsKeypair(
      seed,
      peginTxHash,
      depositorBtcPubkey,
      appContractAddress,
    );
    wotsPublicKey = keypairToPublicKey(keypair);
  } finally {
    // Zero out seed to avoid leaving sensitive key material in memory
    seed.fill(0);
  }

  signal?.throwIfAborted();

  const rpcClient = new VaultProviderRpcApi(
    getVpProxyUrl(providerAddress),
    RPC_TIMEOUT_MS,
  );

  await rpcClient.submitDepositorWotsKey({
    pegin_txid: stripHexPrefix(peginTxHash),
    depositor_pk: stripHexPrefix(depositorBtcPubkey),
    wots_public_keys: wotsPublicKey,
  });
}
