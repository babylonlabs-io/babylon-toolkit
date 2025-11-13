/**
 * BTC Transaction Service
 *
 * Handles creation of BTC peg-in transactions using WASM module.
 * Extracts data from connected BTC wallet and combines with hardcoded
 * local infrastructure data.
 */

import { DEFAULT_BTC_TRANSACTION_FEE, getBTCNetworkForWASM } from "../../config/pegin";
import { createPegInTransaction } from "../../utils/btc/wasm";

export interface CreatePeginTxParams {
  /**
   * Depositor's BTC public key (x-only, 32 bytes hex)
   */
  depositorBtcPubkey: string;

  /**
   * Amount to peg in (in satoshis)
   */
  pegInAmount: bigint;

  /**
   * Funding transaction ID (from selected UTXO)
   */
  fundingTxid: string;

  /**
   * Funding transaction output index (from selected UTXO)
   */
  fundingVout: number;

  /**
   * Funding transaction output value in satoshis (from selected UTXO)
   */
  fundingValue: bigint;

  /**
   * Funding transaction scriptPubKey hex (from selected UTXO)
   */
  fundingScriptPubkey: string;

  /**
   * Selected vault provider's BTC public key (x-only, 32 bytes hex)
   * This is the provider chosen by the user in the UI
   */
  vaultProviderBtcPubkey: string;

  /**
   * Liquidator BTC public keys (x-only, 32 bytes hex without 0x prefix)
   * These are the challengers for the selected vault provider
   */
  liquidatorBtcPubkeys: string[];

  /**
   * Transaction fee in satoshis (optional, defaults to fallback value)
   */
  fee?: bigint;
}

export interface PeginTxResult {
  unsignedTxHex: string;
  txid: string;
  vaultScriptPubKey: string;
  vaultValue: bigint;
  changeValue: bigint;
}

/**
 * Create a peg-in transaction for submission to the vault contract
 *
 * @param params - Transaction parameters including real UTXO data, selected provider, and liquidators
 * @returns Unsigned BTC transaction details
 */
export async function createPeginTxForSubmission(
  params: CreatePeginTxParams,
): Promise<PeginTxResult> {
  // Use provided fee or fallback to default
  const txFee = params.fee ?? DEFAULT_BTC_TRANSACTION_FEE;
  
  // Validate UTXO has sufficient value
  const requiredValue = params.pegInAmount + txFee;
  if (params.fundingValue < requiredValue) {
    throw new Error(
      `Insufficient UTXO value. Required: ${requiredValue} sats, Available: ${params.fundingValue} sats`,
    );
  }

  // Create BTC peg-in transaction using WASM
  const pegInTx = await createPegInTransaction({
    depositTxid: params.fundingTxid,
    depositVout: params.fundingVout,
    depositValue: params.fundingValue,
    depositScriptPubKey: params.fundingScriptPubkey,
    depositorPubkey: params.depositorBtcPubkey,
    claimerPubkey: params.vaultProviderBtcPubkey,
    challengerPubkeys: params.liquidatorBtcPubkeys,
    pegInAmount: params.pegInAmount,
    fee: txFee,
    network: getBTCNetworkForWASM(),
  });

  return {
    unsignedTxHex: pegInTx.txHex,
    txid: pegInTx.txid,
    vaultScriptPubKey: pegInTx.vaultScriptPubKey,
    vaultValue: pegInTx.vaultValue,
    changeValue: pegInTx.changeValue,
  };
}
