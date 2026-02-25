import { VaultProviderRpcApi } from "@/clients/vault-provider-rpc";
import {
  deriveLamportKeypair,
  keypairToHex,
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
  const { publicKey } = keypairToHex(keypair);

  const rpcClient = new VaultProviderRpcApi(providerUrl, RPC_TIMEOUT_MS);

  await rpcClient.submitDepositorLamportPk({
    pegin_txid: peginTxid,
    depositor_pk: depositorBtcPubkey,
    lamport_pk: publicKey,
  });
}
