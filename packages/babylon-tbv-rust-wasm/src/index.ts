// @ts-expect-error - WASM files are in dist/generated/ (checked into git), not src/generated/
import init, { WasmPeginTx } from "./generated/btc_vault.js";

let wasmInitialized = false;
let wasmInitPromise: Promise<void> | null = null;

export async function initWasm() {
  if (wasmInitialized) return;
  if (wasmInitPromise) return wasmInitPromise;

  wasmInitPromise = (async () => {
    try {
      await init();
      wasmInitialized = true;
    } finally {
      wasmInitPromise = null;
    }
  })();

  return wasmInitPromise;
}

export interface PegInParams {
  depositTxid: string;
  depositVout: number;
  depositValue: bigint;
  depositScriptPubKey: string;
  depositorPubkey: string;
  claimerPubkey: string;
  challengerPubkeys: string[];
  pegInAmount: bigint;
  fee: bigint;
  network: "bitcoin" | "testnet" | "regtest" | "signet";
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

// Re-export the raw WASM types if needed
// @ts-expect-error - WASM files are in dist/generated/ (checked into git), not src/generated/
export { WasmPeginTx } from "./generated/btc_vault.js";
