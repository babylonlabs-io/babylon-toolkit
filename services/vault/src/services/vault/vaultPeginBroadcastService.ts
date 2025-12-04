/**
 * BTC Transaction Broadcasting Service
 *
 * Handles signing and broadcasting BTC transactions to the Bitcoin network.
 * Used in PegIn flow step after vault provider verification.
 */

import { Psbt, Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";

import { pushTx } from "../../clients/btc/mempool";
import { getPsbtInputFields } from "../../utils/btc";

import { fetchUTXOFromMempool } from "./vaultUtxoDerivationService";

/**
 * UTXO information needed for PSBT construction
 */
export interface UTXOInfo {
  txid: string;
  vout: number;
  value: bigint;
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

  /**
   * Depositor's BTC public key (x-only format, 32 bytes hex)
   * Required for Taproot (P2TR) signing
   */
  depositorBtcPubkey: string;
}

/**
 * Add inputs from transaction to PSBT with proper UTXO data
 */
async function addInputsToPsbt(
  psbt: Psbt,
  tx: Transaction,
  publicKeyNoCoord: Buffer,
): Promise<void> {
  for (const input of tx.ins) {
    // Extract txid and vout (Bitcoin stores txid in reverse byte order)
    const txid = Buffer.from(input.hash).reverse().toString("hex");
    const vout = input.index;

    // Fetch UTXO data from mempool
    const utxoData = await fetchUTXOFromMempool(txid, vout);

    // Get proper PSBT input fields based on script type
    // Handles P2PKH, P2SH, P2WPKH, P2WSH, P2TR
    const psbtInputFields = getPsbtInputFields(
      {
        txid,
        vout,
        value: utxoData.value,
        scriptPubKey: utxoData.scriptPubKey,
      },
      publicKeyNoCoord,
    );

    // Add input with proper fields for the script type
    psbt.addInput({
      hash: input.hash,
      index: input.index,
      sequence: input.sequence,
      ...psbtInputFields, // Includes witnessUtxo, tapInternalKey (for P2TR), etc.
    });
  }
}

/**
 * Add outputs from transaction to PSBT
 */
function addOutputsToPsbt(psbt: Psbt, tx: Transaction): void {
  for (const output of tx.outs) {
    psbt.addOutput({
      script: output.script,
      value: output.value,
    });
  }
}

/**
 * Convert unsigned transaction to PSBT format
 */
async function createPsbtFromTransaction(
  tx: Transaction,
  publicKeyNoCoord: Buffer,
): Promise<Psbt> {
  const psbt = new Psbt();
  psbt.setVersion(tx.version);
  psbt.setLocktime(tx.locktime);

  await addInputsToPsbt(psbt, tx, publicKeyNoCoord);
  addOutputsToPsbt(psbt, tx);

  return psbt;
}

/**
 * Sign PSBT and extract final transaction hex
 */
async function signAndFinalizePsbt(
  psbtHex: string,
  btcWalletProvider: { signPsbt: (psbtHex: string) => Promise<string> },
): Promise<string> {
  const signedPsbtHex = await btcWalletProvider.signPsbt(psbtHex);
  const signedPsbt = Psbt.fromHex(signedPsbtHex);

  // Finalize inputs if not already finalized
  try {
    signedPsbt.finalizeAllInputs();
  } catch {
    // Some wallets finalize automatically, ignore errors
  }

  return signedPsbt.extractTransaction().toHex();
}

/**
 * Sign and broadcast a PegIn transaction to the Bitcoin network
 *
 * @param params - Transaction and wallet parameters
 * @returns The broadcasted transaction ID
 * @throws Error if signing or broadcasting fails
 */
export async function broadcastPeginTransaction(
  params: BroadcastPeginParams,
): Promise<string> {
  const { unsignedTxHex, btcWalletProvider, depositorBtcPubkey } = params;

  try {
    // Parse transaction
    const cleanHex = unsignedTxHex.startsWith("0x")
      ? unsignedTxHex.slice(2)
      : unsignedTxHex;
    const tx = Transaction.fromHex(cleanHex);

    if (tx.ins.length === 0) {
      throw new Error("Transaction has no inputs");
    }

    // Convert to PSBT with proper input fields
    const publicKeyNoCoord = Buffer.from(depositorBtcPubkey, "hex");
    const psbt = await createPsbtFromTransaction(tx, publicKeyNoCoord);

    // Sign and finalize
    const signedTxHex = await signAndFinalizePsbt(
      psbt.toHex(),
      btcWalletProvider,
    );

    // Broadcast to network
    return await pushTx(signedTxHex);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Failed to broadcast PegIn transaction: ${message}`);
  }
}
