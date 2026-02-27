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

/**
 * Creates an unfunded peg-in transaction with no inputs and one output.
 *
 * This function creates a Bitcoin transaction template that the frontend
 * must fund by:
 * 1. Selecting appropriate UTXOs from the wallet
 * 2. Calculating transaction fees based on selected inputs
 * 3. Adding inputs to cover peginAmount + fees
 * 4. Adding a change output if the input value exceeds peginAmount + fees
 * 5. Creating a PSBT and signing it via the wallet
 *
 * The returned transaction has:
 * - 0 inputs
 * - 1 output (the pegin output to the vault address)
 *
 * @param params - Peg-in parameters (public keys, amount, network)
 * @returns Unfunded transaction details with vault output information
 */
export async function createPegInTransaction(
  params: PegInParams
): Promise<PegInResult> {
  await initWasm();

  const tx = new WasmPeginTx(
    params.depositorPubkey,
    params.vaultProviderPubkey,
    params.vaultKeeperPubkeys,
    params.universalChallengerPubkeys,
    params.timelockPegin,
    params.pegInAmount,
    params.depositorClaimValue,
    params.network
  );

  return {
    txHex: tx.toHex(),
    txid: tx.getTxid(),
    vaultScriptPubKey: tx.getVaultScriptPubKey(),
    vaultValue: tx.getVaultValue(),
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
