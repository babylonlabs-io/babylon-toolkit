/**
 * BTC Transaction Broadcasting Service
 *
 * Handles signing and broadcasting BTC transactions to the Bitcoin network.
 * Used in PegIn flow step after vault provider verification.
 */

import { Psbt, Transaction } from 'bitcoinjs-lib';
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
   * Unsigned transaction hex (from WASM) - raw transaction format
   */
  unsignedTxHex: string;

  /**
   * UTXO being spent in the transaction
   * Required to construct witness UTXO data for PSBT signing
   */
  utxo: UTXOInfo;

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
 * 1. Converts raw unsigned transaction hex to PSBT format
 * 2. Adds witness UTXO data required for signing
 * 3. Signs the PSBT using the user's BTC wallet
 * 4. Extracts the final signed transaction
 * 5. Broadcasts it to the Bitcoin network via mempool API
 *
 * @param params - Transaction and wallet parameters
 * @returns The broadcasted transaction ID
 * @throws Error if signing or broadcasting fails
 */
export async function broadcastPeginTransaction(
  params: BroadcastPeginParams,
): Promise<string> {
  const { unsignedTxHex, utxo, btcWalletProvider } = params;

  const cleanHex = unsignedTxHex.startsWith('0x')
    ? unsignedTxHex.slice(2)
    : unsignedTxHex;

  try {
    // Step 1: Convert raw transaction hex to PSBT with witness UTXO data
    // Parse the raw transaction
    const tx = Transaction.fromHex(cleanHex);

    // Create a new PSBT from the transaction
    const psbt = new Psbt();
    psbt.setVersion(tx.version);
    psbt.setLocktime(tx.locktime);

    // Add input with witness UTXO data
    // For SegWit/Taproot transactions, we need the witness UTXO
    const witnessUtxo = {
      script: Buffer.from(utxo.scriptPubKey, 'hex'),
      value: Number(utxo.value),
    };

    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo,
    });

    // Add all outputs from the unsigned transaction
    for (const output of tx.outs) {
      psbt.addOutput({
        script: output.script,
        value: output.value,
      });
    }

    const psbtHex = psbt.toHex();

    // Step 2: Sign PSBT with user's BTC wallet
    const signedPsbtHex = await btcWalletProvider.signPsbt(psbtHex);

    // Step 3: Extract finalized transaction from signed PSBT
    const signedPsbt = Psbt.fromHex(signedPsbtHex);

    // Finalize inputs if not already finalized
    try {
      signedPsbt.finalizeAllInputs();
    } catch (e) {
      // Some wallets may finalize automatically
    }

    const signedTxHex = signedPsbt.extractTransaction().toHex();

    // Step 4: Broadcast to Bitcoin network
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
