import { VaultProviderRpcApi } from "@/clients/vault-provider-rpc";
import {
  deriveLamportKeypair,
  keypairToPublicKey,
  mnemonicToLamportSeed,
} from "@/services/lamport";
import { stripHexPrefix } from "@/utils/btc";

import type { LamportSubmissionParams } from "./types";

const RPC_TIMEOUT_MS = 60 * 1000;

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
