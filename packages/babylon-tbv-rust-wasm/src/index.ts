// @ts-expect-error - WASM files are in dist/generated/ (checked into git), not src/generated/
import init, { WasmPeginTx, computeMinClaimValue as wasmComputeMinClaimValue, numUtxosForInputLabels as wasmNumUtxosForInputLabels } from "./generated/btc_vault.js";
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
 * TODO: Remove once the new Pre-PegIn flow replaces the current flow.
 * The new flow uses createPrePeginTransaction() + buildPeginFromPrePegin() instead.
 *
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

/**
 * Compute the minimum depositor claim value (PegIn output 1) in satoshis.
 *
 * This covers the full downstream tx graph cost (Claim → Assert → Payout)
 * based on the protocol parameters.
 */
export async function computeMinClaimValue(
  numLocalChallengers: number,
  numUniversalChallengers: number,
  numGcs: number,
  councilQuorum: number,
  councilSize: number,
  feeRate: bigint,
): Promise<bigint> {
  await initWasm();
  return wasmComputeMinClaimValue(
    numLocalChallengers,
    numUniversalChallengers,
    numGcs,
    councilQuorum,
    councilSize,
    feeRate,
  );
}

/**
 * Returns the protocol constant for the number of UTXOs (Assert outputs)
 * per challenger. Currently 3, derived from Bitcoin's 1000 stack element limit.
 */
export async function numUtxosForInputLabels(): Promise<number> {
  await initWasm();
  return wasmNumUtxosForInputLabels();
}

// Export types
export type {
  Network,
  PegInParams,
  PegInResult,
  PayoutConnectorParams,
  PayoutConnectorInfo,
  AssertPayoutNoPayoutConnectorParams,
  AssertPayoutScriptInfo,
  AssertNoPayoutScriptInfo,
  ChallengeAssertConnectorParams,
  ChallengeAssertScriptInfo,
  PrePeginHtlcConnectorParams,
  PrePeginHtlcConnectorInfo,
  PrePeginTxParams,
  PrePeginTxResult,
  PeginFromPrePeginParams,
  PeginFromPrePeginResult,
  RefundFromPrePeginParams,
} from "./types.js";

// Export constants
export { TAP_INTERNAL_KEY, tapInternalPubkey } from "./constants.js";

// Export payout connector utilities
export { createPayoutConnector, getPeginPayoutScript } from "./payoutConnector.js";

// Export assert payout/nopayout connector utilities (depositor-as-claimer)
export {
  getAssertPayoutScriptInfo,
  getAssertNoPayoutScriptInfo,
} from "./assertPayoutNoPayoutConnector.js";

// Export challenge assert connector utilities (depositor-as-claimer)
export { getChallengeAssertScriptInfo } from "./challengeAssertConnector.js";

// Pre-PegIn utilities — function exports are staged in
// prePeginTx.ts and prePeginHtlcConnector.ts but NOT re-exported here
// until WASM is rebuilt with Pre-PegIn support.
// Only type exports are included above (compile-time only, no runtime impact).

// TODO: Remove WasmPeginTx re-export once the new Pre-PegIn flow replaces the current flow.
// The new flow constructs PegIn via WasmPrePeginTx.buildPeginTx() instead.
// Re-export the raw WASM types if needed
// @ts-expect-error - WASM files are in dist/generated/ (checked into git), not src/generated/
export { WasmPeginTx, WasmPeginPayoutConnector } from "./generated/btc_vault.js";
