import { 
  initWasm, 
  createPegInTransaction as createPegInTx, 
  WasmPeginTx 
} from "@babylonlabs-io/babylon-tbv-rust-wasm";

// Re-export initWasm for convenience
export { initWasm };

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
  // Direct call to the centralized package's createPegInTransaction
  return await createPegInTx(params);
}

// Re-export the raw WASM types if needed
export { WasmPeginTx };
