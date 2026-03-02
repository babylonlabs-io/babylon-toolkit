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
  computeLamportPkHash,
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
    signal,
  } = params;

  signal?.throwIfAborted();

  const peginTxid = stripHexPrefix(btcTxid);
  // Strip 0x prefix from depositorBtcPubkey to match the format used during
  // deriveLamportPkHash (which receives the raw x-only pubkey from the wallet).
  // The resume flow passes activity.depositorBtcPubkey which has a 0x prefix
  // from the indexer, causing a keypair mismatch if not normalized here.
  const normalizedDepositorPk = stripHexPrefix(depositorBtcPubkey);

  const mnemonic = await getMnemonic();
  signal?.throwIfAborted();

  // DEBUG: Log all derivation inputs so we can compare with the initial deposit
  console.log("[Lamport DEBUG] === submitLamportPublicKey ===");
  console.log("[Lamport DEBUG] Raw inputs:", {
    btcTxid,
    depositorBtcPubkey,
    appContractAddress,
  });
  console.log("[Lamport DEBUG] Normalized inputs:", {
    peginTxid,
    peginTxidLen: peginTxid.length,
    normalizedDepositorPk,
    normalizedDepositorPkLen: normalizedDepositorPk.length,
    appContractAddress,
    appContractAddressLower: appContractAddress.toLowerCase(),
    appAddressLen: appContractAddress.length,
    appAddressCasingChanged: appContractAddress !== appContractAddress.toLowerCase(),
  });
  console.log("[Lamport DEBUG] Mnemonic info:", {
    wordCount: mnemonic.split(" ").length,
    firstWord: mnemonic.split(" ")[0],
    lastWord: mnemonic.split(" ").at(-1),
  });

  const seed = mnemonicToLamportSeed(mnemonic);
  let lamportPublicKey: ReturnType<typeof keypairToPublicKey>;
  try {
    // Derive with the ORIGINAL appContractAddress (as passed in)
    const keypair = await deriveLamportKeypair(
      seed,
      peginTxid,
      normalizedDepositorPk,
      appContractAddress,
    );
    lamportPublicKey = keypairToPublicKey(keypair);
    const hashOriginal = computeLamportPkHash(keypair);

    console.log("[Lamport DEBUG] Hash (original appAddr):", hashOriginal);
    console.log("[Lamport DEBUG] false_list[0]:", lamportPublicKey.false_list[0]);
    console.log("[Lamport DEBUG] true_list[0]:", lamportPublicKey.true_list[0]);
    console.log("[Lamport DEBUG] list lengths:", lamportPublicKey.false_list.length, lamportPublicKey.true_list.length);

    // Also compute with lowercase appContractAddress to check if casing matters
    if (appContractAddress !== appContractAddress.toLowerCase()) {
      const seed2 = mnemonicToLamportSeed(mnemonic);
      try {
        const keypair2 = await deriveLamportKeypair(
          seed2,
          peginTxid,
          normalizedDepositorPk,
          appContractAddress.toLowerCase(),
        );
        const hashLower = computeLamportPkHash(keypair2);
        console.log("[Lamport DEBUG] Hash (lowercase appAddr):", hashLower);
        console.log("[Lamport DEBUG] Hashes match?", hashOriginal === hashLower);
      } finally {
        seed2.fill(0);
      }
    }
  } finally {
    // Zero out seed to avoid leaving sensitive key material in memory
    seed.fill(0);
  }

  signal?.throwIfAborted();

  const rpcClient = new VaultProviderRpcApi(providerUrl, RPC_TIMEOUT_MS);

  await rpcClient.submitDepositorLamportKey({
    pegin_txid: peginTxid,
    depositor_pk: normalizedDepositorPk,
    lamport_public_key: lamportPublicKey,
  });
}
