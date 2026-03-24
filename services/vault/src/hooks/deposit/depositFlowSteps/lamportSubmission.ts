/**
 * Step 2.5: Lamport public key RPC submission
 *
 * Derives a deterministic Lamport keypair from the depositor's mnemonic
 * and vault-specific inputs (pegin txid, depositor pubkey, app contract
 * address), then submits the full public key to the vault provider via RPC.
 *
 * Note: The Lamport keypair is first derived *before* the ETH transaction
 * so its keccak256 hash can be committed on-chain as `depositorLamportPkHash`.
 * This function re-derives the same keypair and sends the full public key
 * to the vault provider *after* the ETH transaction is confirmed, since the
 * VP only accepts keys for pegins that are finalized on Ethereum.
 *
 * Also used by the "resume deposit" flow when a user returns after closing
 * the app before the RPC submission completed.
 */

import { VaultProviderRpcApi } from "@/clients/vault-provider-rpc";
import { DaemonStatus } from "@/models/peginStateMachine";
import {
  deriveLamportKeypair,
  keypairToPublicKey,
  mnemonicToLamportSeed,
} from "@/services/lamport";
import { waitForPeginStatus } from "@/services/vault/vaultPeginStatusService";
import { stripHexPrefix } from "@/utils/btc";
import { getVpProxyUrl } from "@/utils/rpc";

import type { LamportSubmissionParams } from "./types";

/** Timeout for the Lamport key submission RPC call. */
const RPC_TIMEOUT_MS = 60 * 1000;

/** Maximum time to wait for VP to reach PendingDepositorLamportPK (5 minutes). */
const STATUS_POLL_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Statuses that come after Lamport key submission.
 * If the VP is already in one of these states, the key was already submitted
 * (e.g. via resume flow) and we can skip.
 */
const POST_LAMPORT_STATUSES = new Set<string>([
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
  DaemonStatus.PENDING_DEPOSITOR_LAMPORT_PK,
  ...POST_LAMPORT_STATUSES,
]);

/**
 * Derive a Lamport keypair from the mnemonic and submit the full public
 * key to the vault provider via RPC. The VP validates the key against the
 * keccak256 hash committed on-chain during the pegin ETH transaction.
 *
 * Polls `getPeginStatus` first to ensure the VP has ingested the pegin and
 * is ready to accept the Lamport key (status = `PendingDepositorLamportPK`).
 * If the VP has already moved past that status, submission is skipped.
 *
 * @param params - Vault identifiers, provider URL, and a callback to
 *                 retrieve the decrypted mnemonic.
 */
export async function submitLamportPublicKey(
  params: LamportSubmissionParams,
): Promise<void> {
  const {
    btcTxid,
    depositorBtcPubkey,
    appContractAddress,
    providerAddress,
    getMnemonic,
    signal,
  } = params;

  signal?.throwIfAborted();

  // Wait until VP has ingested the pegin and is ready for the Lamport key.
  const status = await waitForPeginStatus({
    providerAddress,
    btcTxid,
    targetStatuses: TARGET_STATUSES,
    timeoutMs: STATUS_POLL_TIMEOUT_MS,
    signal,
  });

  // Key was already submitted in a previous session (e.g. resume flow)
  if (POST_LAMPORT_STATUSES.has(status)) {
    return;
  }

  const mnemonic = await getMnemonic();
  signal?.throwIfAborted();

  const seed = mnemonicToLamportSeed(mnemonic);
  let lamportPublicKey: ReturnType<typeof keypairToPublicKey>;
  try {
    const keypair = await deriveLamportKeypair(
      seed,
      btcTxid,
      depositorBtcPubkey,
      appContractAddress,
    );
    lamportPublicKey = keypairToPublicKey(keypair);
  } finally {
    // Zero out seed to avoid leaving sensitive key material in memory
    seed.fill(0);
  }

  signal?.throwIfAborted();

  const rpcClient = new VaultProviderRpcApi(
    getVpProxyUrl(providerAddress),
    RPC_TIMEOUT_MS,
  );

  await rpcClient.submitDepositorLamportKey({
    pegin_txid: stripHexPrefix(btcTxid),
    depositor_pk: stripHexPrefix(depositorBtcPubkey),
    lamport_public_key: lamportPublicKey,
  });
}
