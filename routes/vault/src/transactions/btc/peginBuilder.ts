/**
 * BTC Transaction Service
 *
 * Handles creation of BTC peg-in transactions using WASM module.
 * Extracts data from connected BTC wallet and combines with hardcoded
 * local infrastructure data.
 */

import { createPegInTransaction } from '../../transactions/btc/pegin';
import { LOCAL_PEGIN_CONFIG, getBTCNetworkForWASM } from '../../config/pegin';
import { estimatePeginFee } from '../../utils/fee/peginFee';

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
   * Fee rate in satoshis per vbyte
   * Should be fetched from mempool API (useNetworkFees hook)
   * Falls back to LOCAL_PEGIN_CONFIG.fallbackFeeRate if not provided
   */
  feeRate: number;
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
 * 1. Takes REAL user data (BTC pubkey, amount, selected provider) from wallet/UI
 * 2. Uses REAL funding UTXO from connected BTC wallet
 * 3. Uses HARDCODED liquidator data from local deployment (TODO: fetch from backend)
 * 4. Calls WASM module to construct the unsigned BTC transaction
 *
 * @param params - Transaction parameters including real UTXO data and selected provider
 * @returns Unsigned BTC transaction details
 */
export async function createPeginTxForSubmission(
  params: CreatePeginTxParams,
): Promise<PeginTxResult> {
  // Calculate fee dynamically based on transaction size and fee rate
  // Fee rate should come from mempool API (passed from caller)
  const fee = estimatePeginFee(
    params.pegInAmount,
    params.fundingValue,
    params.feeRate,
  );

  // Validate UTXO has sufficient value
  const requiredValue = params.pegInAmount + fee;
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

    // REAL: From connected BTC wallet
    depositorPubkey: params.depositorBtcPubkey,

    // REAL: Selected vault provider (claimer) chosen by user
    claimerPubkey: params.vaultProviderBtcPubkey,

    // HARDCODED: Local liquidators (challengers) from deployment
    // TODO: Fetch liquidators from backend API
    challengerPubkeys: LOCAL_PEGIN_CONFIG.liquidatorBtcPubkeys,

    // REAL: From user input
    pegInAmount: params.pegInAmount,

    // CALCULATED: Dynamic fee based on transaction size and fee rate
    fee: fee,

    // Network from environment (converted to WASM format)
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
