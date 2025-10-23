// @ts-expect-error - WASM files are in dist/generated/ (checked into git), not src/generated/
import init, { WasmPeginTx } from "./generated/btc_vault.js";
import type { PegInParams, PegInResult } from "./types.js";

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

// Export types
export type {
  Network,
  PegInParams,
  PegInResult,
  PayoutConnectorParams,
  PayoutConnectorInfo,
} from "./types.js";

// Export constants
export { TAP_INTERNAL_KEY, tapInternalPubkey } from "./constants.js";

// Export payout connector utilities
export { createPayoutConnector } from "./payoutConnector.js";

// Re-export the raw WASM types if needed
// @ts-expect-error - WASM files are in dist/generated/ (checked into git), not src/generated/
export { WasmPeginTx, WasmPeginPayoutConnector } from "./generated/btc_vault.js";
