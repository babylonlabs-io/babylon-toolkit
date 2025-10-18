/**
 * BTC Payout Transaction Signing Service
 *
 * Handles signing payout transactions for the peg-in flow.
 * Extracts Schnorr signatures (64 bytes) required by the vault provider.
 */

import { Psbt, Transaction } from 'bitcoinjs-lib';

export interface SignPayoutTransactionParams {
  /**
   * Transaction hex from vault provider (payout_tx.tx_hex)
   */
  transactionHex: string;

  /**
   * BTC wallet provider with signing capability
   */
  btcWalletProvider: {
    signPsbt: (psbtHex: string) => Promise<string>;
  };
}

/**
 * Sign a payout transaction and extract the Schnorr signature
 *
 * This function:
 * 1. Converts the raw transaction hex to PSBT format
 * 2. Signs the PSBT using the user's BTC wallet (Schnorr signature for Taproot)
 * 3. Extracts the 64-byte Schnorr signature (without sighash flag)
 * 4. Returns the signature as a hex string
 *
 * @param params - Transaction and wallet parameters
 * @returns 64-byte Schnorr signature (128 hex characters, no sighash flag)
 * @throws Error if signing fails or signature cannot be extracted
 */
export async function signPayoutTransaction(
  params: SignPayoutTransactionParams,
): Promise<string> {
  const { transactionHex, btcWalletProvider } = params;

  // Remove 0x prefix if present
  const cleanHex = transactionHex.startsWith('0x')
    ? transactionHex.slice(2)
    : transactionHex;

  try {
    // Step 1: Parse the raw transaction
    const tx = Transaction.fromHex(cleanHex);

    // Step 2: Convert to PSBT for wallet signing
    // Note: The payout transaction from the vault provider is a partially constructed
    // transaction that needs the depositor's signature. We convert it to PSBT format
    // so the wallet can sign it using Taproot/Schnorr signing.
    const psbt = new Psbt();
    psbt.setVersion(tx.version);
    psbt.setLocktime(tx.locktime);

    // Add inputs (these are already constructed by the vault provider)
    // The wallet will sign these inputs with Taproot key path spend
    for (let i = 0; i < tx.ins.length; i++) {
      const input = tx.ins[i];
      psbt.addInput({
        hash: input.hash,
        index: input.index,
        sequence: input.sequence,
        // Note: For Taproot, the witness UTXO will be required
        // The wallet should handle this during signing
      });
    }

    // Add outputs
    for (const output of tx.outs) {
      psbt.addOutput({
        script: output.script,
        value: output.value,
      });
    }

    const psbtHex = psbt.toHex();

    // Step 3: Sign PSBT with user's BTC wallet
    // The wallet will produce a Schnorr signature for Taproot inputs
    const signedPsbtHex = await btcWalletProvider.signPsbt(psbtHex);
    const signedPsbt = Psbt.fromHex(signedPsbtHex);

    // Step 4: Extract the Schnorr signature from the signed PSBT
    // For Taproot key path spend, the witness contains just the signature
    // Schnorr signatures are 64 bytes (no sighash flag for default SIGHASH_ALL in Schnorr)
    if (signedPsbt.data.inputs.length === 0) {
      throw new Error('No inputs found in signed PSBT');
    }

    const firstInput = signedPsbt.data.inputs[0];

    // Check for Taproot key path signature (tapKeySig)
    if (firstInput.tapKeySig) {
      // Schnorr signature is 64 bytes (no sighash flag for SIGHASH_DEFAULT)
      const signature = firstInput.tapKeySig;
      if (signature.length === 64) {
        return signature.toString('hex');
      } else if (signature.length === 65) {
        // Some implementations might include sighash flag, remove it
        return signature.subarray(0, 64).toString('hex');
      }
      throw new Error(`Unexpected Schnorr signature length: ${signature.length}`);
    }

    // If no tapKeySig, check finalScriptWitness
    if (firstInput.finalScriptWitness) {
      // Parse the witness stack
      const witness = firstInput.finalScriptWitness;
      // For key path spend, witness should be just [signature]
      // The signature is the first element after the count
      // Parse witness: [count][length][signature]
      let offset = 0;
      const count = witness[offset];
      offset += 1;

      if (count > 0) {
        const sigLength = witness[offset];
        offset += 1;
        const signature = witness.subarray(offset, offset + sigLength);

        if (signature.length === 64) {
          return signature.toString('hex');
        } else if (signature.length === 65) {
          // Remove sighash flag if present
          return signature.subarray(0, 64).toString('hex');
        }
      }
    }

    throw new Error(
      'Could not extract Schnorr signature from signed PSBT. ' +
      'Make sure your wallet supports Taproot signing.',
    );
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to sign payout transaction: ${error.message}`);
    }
    throw new Error('Failed to sign payout transaction: Unknown error');
  }
}
