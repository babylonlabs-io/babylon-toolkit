/**
 * BTC Transaction Service
 *
 * Handles creation of BTC peg-in transactions using WASM module.
 */

import { createPegInTransaction } from './pegin';
import { PEGIN_FEE_CONFIG, getBTCNetworkForWASM } from '../../config/pegin';

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
   * Liquidators' BTC public keys (x-only, 32 bytes hex each)
   * These are the challengers fetched from the vault-indexer API
   */
  liquidatorBtcPubkeys: string[];

  /**
   * Optional custom fee (in satoshis)
   * If not provided, uses default fee from config
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
 * This function:
 * 1. Uses funding UTXO from the user's BTC wallet
 * 2. Uses provider data fetched from vault-indexer API
 * 3. Calls WASM module to construct the unsigned BTC transaction
 *
 * @param params - Transaction parameters including real UTXO data, selected provider, and liquidators
 * @returns Unsigned BTC transaction details
 */
export async function createPeginTxForSubmission(
  params: CreatePeginTxParams,
): Promise<PeginTxResult> {
  // Determine fee to use
  const fee = params.fee ?? PEGIN_FEE_CONFIG.defaultFee;
  
  // Validate UTXO has sufficient value
  const requiredValue = params.pegInAmount + fee;
  if (params.fundingValue < requiredValue) {
    throw new Error(
      `Insufficient UTXO value. Required: ${requiredValue} sats, Available: ${params.fundingValue} sats`,
    );
  }

  // Validate liquidators are provided
  if (!params.liquidatorBtcPubkeys || params.liquidatorBtcPubkeys.length === 0) {
    throw new Error('Liquidators are required for peg-in transaction');
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

    fee,

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

