import init, { WasmPeginTx } from "@routes/vault/wasm/btc_vaults.js";

let wasmInitialized = false;

export async function initWasm() {
  if (wasmInitialized) return;
  await init();
  wasmInitialized = true;
}

export interface PegInParams {
  depositTxid: string;
  depositVout: number;
  depositValue: bigint;
  depositScriptPubKey: string; // hex
  depositorPubkey: string; // 64-char hex
  claimerPubkey: string; // 64-char hex
  challengerPubkeys: string[]; // array of 64-char hex
  pegInAmount: bigint;
  fee: bigint;
  network: "bitcoin" | "testnet" | "regtest";
}

export interface PegInResult {
  txHex: string;
  txid: string;
  vaultScriptPubKey: string;
  vaultValue: bigint;
  changeValue: bigint;
}

export async function createPegInTransaction(
  params: PegInParams
): Promise<PegInResult> {
  await initWasm();

  const tx = new WasmPeginTx(
    params.depositTxid,
    params.depositVout,
    params.depositValue,
    params.depositScriptPubKey,
    params.depositorPubkey,
    params.claimerPubkey,
    params.challengerPubkeys,
    params.pegInAmount,
    params.fee,
    params.network
  );

  return {
    txHex: tx.toHex(),
    txid: tx.getTxid(),
    vaultScriptPubKey: tx.getVaultScriptPubKey(),
    vaultValue: tx.getVaultValue(),
    changeValue: tx.getChangeValue(),
  };
}
