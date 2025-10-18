/**
 * BTC Transaction Broadcasting Service
 *
 * Handles signing and broadcasting BTC transactions to the Bitcoin network.
 * Used in PegIn flow step after vault provider verification.
 */

import { Psbt, Transaction } from 'bitcoinjs-lib';
import { fetchUTXOFromMempool } from './utxoDerivationService';
import { pushTx } from '../../clients/btc/mempool';

/**
 * UTXO information needed for PSBT construction
 */
export interface UTXOInfo {
  /**
   * Transaction ID of the UTXO
   */
  txid: string;

  /**
   * Output index (vout) of the UTXO
   */
  vout: number;

  /**
   * Value of the UTXO in satoshis
   */
  value: bigint;

  /**
   * ScriptPubKey of the UTXO (hex string)
   */
  scriptPubKey: string;
}

export interface BroadcastPeginParams {
  /**
   * Unsigned transaction hex (from contract or WASM)
   */
  unsignedTxHex: string;

  /**
   * BTC wallet provider with signing capability
   */
  btcWalletProvider: {
    signPsbt: (psbtHex: string) => Promise<string>;
  };
}

/**
 * Sign and broadcast a PegIn transaction to the Bitcoin network
 *
 * This function:
 * 1. Derives UTXO information from the unsigned transaction (queries mempool API)
 * 2. Converts raw unsigned transaction hex to PSBT format
 * 3. Adds witness UTXO data required for signing
 * 4. Signs the PSBT using the user's BTC wallet
 * 5. Extracts the final signed transaction
 * 6. Broadcasts it to the Bitcoin network via mempool API
 *
 * @param params - Transaction and wallet parameters
 * @returns The broadcasted transaction ID
 * @throws Error if signing or broadcasting fails
 */
export async function broadcastPeginTransaction(
  params: BroadcastPeginParams,
): Promise<string> {
  const { unsignedTxHex, btcWalletProvider } = params;

  const cleanHex = unsignedTxHex.startsWith('0x')
    ? unsignedTxHex.slice(2)
    : unsignedTxHex;

  try {
    // Step 1: Parse the raw transaction
    const tx = Transaction.fromHex(cleanHex);

    // Validate transaction has at least one input
    if (tx.ins.length === 0) {
      throw new Error('Transaction has no inputs');
    }

    // Step 2: Create PSBT and set version/locktime
    const psbt = new Psbt();
    psbt.setVersion(tx.version);
    psbt.setLocktime(tx.locktime);

    // Step 3: Add ALL inputs with their witness UTXO data
    // Note: Per btc-transactions-spec.md, peg-in transactions can have multiple inputs
    // "Amount of inputs is not constrained. Inputs can be arbitrary type except of legacy inputs"
    // We need to fetch UTXO data for each input from mempool API
    for (const input of tx.ins) {
      // Extract txid and vout from this input
      // Bitcoin stores txid in reverse byte order
      const txid = Buffer.from(input.hash).reverse().toString('hex');
      const vout = input.index;

      // Fetch UTXO data from mempool for this specific input
      const utxoData = await fetchUTXOFromMempool(txid, vout);

      // For SegWit/Taproot transactions, we need the witness UTXO
      const witnessUtxo = {
        script: Buffer.from(utxoData.scriptPubKey, 'hex'),
        value: utxoData.value, // Already a number from fetchUTXOFromMempool
      };

      // Add input with witness UTXO data
      // Use the input hash directly from parsed transaction (already in correct Buffer format)
      psbt.addInput({
        hash: input.hash,
        index: input.index,
        witnessUtxo,
      });
    }

    // Add all outputs from the unsigned transaction
    for (const output of tx.outs) {
      psbt.addOutput({
        script: output.script,
        value: output.value,
      });
    }

    const psbtHex = psbt.toHex();

    // Step 3: Sign PSBT with user's BTC wallet
    const signedPsbtHex = await btcWalletProvider.signPsbt(psbtHex);

    // Step 4: Extract finalized transaction from signed PSBT
    const signedPsbt = Psbt.fromHex(signedPsbtHex);

    // Finalize inputs if not already finalized
    try {
      signedPsbt.finalizeAllInputs();
    } catch {
      // Some wallets may finalize automatically, ignore errors
    }

    const signedTxHex = signedPsbt.extractTransaction().toHex();

    // Step 5: Broadcast to Bitcoin network
    const txId = await pushTx(signedTxHex);

    return txId;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `Failed to broadcast PegIn transaction: ${error.message}`,
      );
    }
    throw new Error('Failed to broadcast PegIn transaction: Unknown error');
  }
}
