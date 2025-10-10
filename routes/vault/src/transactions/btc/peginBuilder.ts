/**
 * BTC Transaction Service
 *
 * Handles creation of BTC peg-in transactions using WASM module.
 * Extracts data from connected BTC wallet and combines with hardcoded
 * local infrastructure data.
 */

import { createPegInTransaction } from '../../transactions/btc/pegin';
import { LOCAL_PEGIN_CONFIG, getBTCNetworkForWASM } from '../../config/pegin';

export interface CreatePeginTxParams {
  /**
   * Depositor's BTC public key
   */
  depositorBtcPubkey: string;

  /**
   * Amount to peg in (in satoshis)
   */
  pegInAmount: bigint;

  /**
   * MOCKED: Funding transaction details
   * For POC, we use dummy values. In production, these would come from
   * actual BTC wallet UTXO selection
   */
  fundingTxid?: string;
  fundingVout?: number;
  fundingValue?: bigint;
  fundingScriptPubkey?: string;
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
 * 1. Takes real user data (BTC pubkey, amount) from wallet/UI
 * 2. Uses MOCKED funding transaction for POC
 * 3. Uses HARDCODED vault provider and liquidator data from local deployment
 * 4. Calls WASM module to construct the unsigned BTC transaction
 *
 * @param params - Transaction parameters
 * @returns Unsigned BTC transaction details
 */
export async function createPeginTxForSubmission(
  params: CreatePeginTxParams,
): Promise<PeginTxResult> {
  // MOCKED: Use dummy funding transaction for POC
  // TODO: Replace with actual BTC wallet UTXO selection in production
  // In production, we would:
  // 1. Query BTC wallet for available UTXOs
  // 2. Select appropriate UTXO(s) that cover pegInAmount + fee + change dust
  // 3. Use the actual txid, vout, value, and scriptPubkey from selected UTXO
  const fundingTxid = params.fundingTxid || '0'.repeat(64); // Dummy txid
  const fundingVout = params.fundingVout ?? 0;
  const fundingValue =
    params.fundingValue ??
    params.pegInAmount + LOCAL_PEGIN_CONFIG.btcTransactionFee + 50_000n; // Add buffer for change
  const fundingScriptPubkey =
    params.fundingScriptPubkey || '5120' + 'a'.repeat(64); // Dummy P2TR script

  // Create BTC peg-in transaction using WASM
  const pegInTx = await createPegInTransaction({
    // MOCKED: Funding transaction (UTXO) - dummy values for POC
    depositTxid: fundingTxid,
    depositVout: fundingVout,
    depositValue: fundingValue,
    depositScriptPubKey: fundingScriptPubkey,

    // REAL: From connected BTC wallet
    depositorPubkey: params.depositorBtcPubkey,

    // HARDCODED: Local vault provider (claimer) from deployment
    claimerPubkey: LOCAL_PEGIN_CONFIG.vaultProviderBtcPubkey,

    // HARDCODED: Local liquidators (challengers) from deployment
    challengerPubkeys: LOCAL_PEGIN_CONFIG.liquidatorBtcPubkeys,

    // REAL: From user input
    pegInAmount: params.pegInAmount,

    // HARDCODED: Fixed fee for local development
    fee: LOCAL_PEGIN_CONFIG.btcTransactionFee,

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
