/**
 * BTC Transaction Service
 *
 * Handles creation of BTC peg-in transactions using WASM module.
 * Supports multiple UTXOs with dynamic fee calculation.
 */

import { Transaction } from 'bitcoinjs-lib';
import { createPegInTransaction } from '../../utils/btc/wasm';
import { getBTCNetworkForWASM } from '../../config/pegin';
import { buildPeginTransaction, getNetwork } from '../../utils/transaction';
import { selectUtxosForPegin, type UTXO } from '../../utils/utxo';

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
   * Available UTXOs from wallet
   */
  availableUTXOs: UTXO[];

  /**
   * Fee rate in sat/vbyte
   */
  feeRate: number;

  /**
   * Change address from wallet
   */
  changeAddress: string;

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
}

export interface PeginTxResult {
  /** Unsigned transaction hex (for wallet signing and contract submission) */
  unsignedTxHex: string;
  /** Transaction ID (calculated from unsigned tx) */
  txid: string;
  /** Selected UTXOs used as inputs */
  selectedUTXOs: UTXO[];
  /** Calculated fee in satoshis */
  fee: bigint;
  /** Change amount in satoshis */
  changeAmount: bigint;
  /** Vault script pubkey */
  vaultScriptPubKey: string;
  /** Vault output value */
  vaultValue: bigint;
}

/**
 * Create a peg-in transaction for submission to the vault contract.
 *
 * This function orchestrates the complete flow:
 * 1. Get unfunded transaction from WASM (0 inputs, 1 output)
 * 2. Select UTXOs to fund the transaction
 * 3. Calculate fees dynamically based on selected inputs
 * 4. Build a funded transaction ready for wallet signing
 *
 * @param params - Transaction parameters including UTXOs, fee rate, and vault provider info
 * @returns Transaction and details
 */
export async function createPeginTxForSubmission(
  params: CreatePeginTxParams,
): Promise<PeginTxResult> {
  // Step 1: Get unfunded transaction from WASM
  // This creates a tx with 0 inputs and 1 output (the pegin output)
  const unfundedTxResult = await createPegInTransaction({
    depositorPubkey: params.depositorBtcPubkey,
    claimerPubkey: params.vaultProviderBtcPubkey,
    challengerPubkeys: params.liquidatorBtcPubkeys,
    pegInAmount: params.pegInAmount,
    network: getBTCNetworkForWASM(),
  });

  // Step 2: Select UTXOs with iterative fee calculation
  // This function internally:
  // - Filters for script validity
  // - Sorts by value (largest first)
  // - Iteratively selects UTXOs and recalculates fee
  // - Returns selected UTXOs, calculated fee, and change amount
  const selectionResult = selectUtxosForPegin(
    params.availableUTXOs,
    params.pegInAmount,
    params.feeRate,
  );

  const { selectedUTXOs, fee, changeAmount } = selectionResult;

  // Step 3: Build complete transaction
  // buildPeginTransaction returns unsigned transaction hex ready for wallet signing
  const network = getNetwork(getBTCNetworkForWASM());
  const unsignedTxHex = buildPeginTransaction({
    unfundedTxHex: unfundedTxResult.txHex,
    selectedUTXOs,
    changeAddress: params.changeAddress,
    changeAmount,
    network,
  });

  // Step 4: Parse transaction to get txid
  const unsignedTx = Transaction.fromHex(unsignedTxHex);
  const txid = unsignedTx.getId();

  return {
    unsignedTxHex,
    txid,
    selectedUTXOs,
    fee,
    changeAmount,
    vaultScriptPubKey: unfundedTxResult.vaultScriptPubKey,
    vaultValue: unfundedTxResult.vaultValue,
  };
}
