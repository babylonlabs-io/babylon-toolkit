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
import {
  deriveLamportKeypair,
  keypairToPublicKey,
  mnemonicToLamportSeed,
} from "@/services/lamport";
import { stripHexPrefix } from "@/utils/btc";

import type { LamportSubmissionParams } from "./types";

/** Timeout for the Lamport key submission RPC call. */
const RPC_TIMEOUT_MS = 60 * 1000;

/**
 * Derive a Lamport keypair from the mnemonic and submit the full public
 * key to the vault provider via RPC. The VP validates the key against the
 * keccak256 hash committed on-chain during the pegin ETH transaction.
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
    providerUrl,
    getMnemonic,
  } = params;

  const peginTxid = stripHexPrefix(btcTxid);

  const mnemonic = await getMnemonic();
  const seed = mnemonicToLamportSeed(mnemonic);
  const keypair = await deriveLamportKeypair(
    seed,
    peginTxid,
    depositorBtcPubkey,
    appContractAddress,
  );
  const lamportPublicKey = keypairToPublicKey(keypair);

  const rpcClient = new VaultProviderRpcApi(providerUrl, RPC_TIMEOUT_MS);

  await rpcClient.submitDepositorLamportKey({
    pegin_txid: peginTxid,
    depositor_pk: depositorBtcPubkey,
    lamport_public_key: lamportPublicKey,
  });
}
