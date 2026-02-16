/**
 * UTXO Split Transaction Builder
 *
 * Creates Bitcoin transactions that split input UTXOs into multiple outputs.
 * Used for multi-vault peg-in flow when user doesn't have enough separate UTXOs.
 *
 * Transaction Flow:
 * 1. createSplitTransaction() → unsigned transaction with deterministic txid
 * 2. createSplitTransactionPsbt() → PSBT ready for wallet signing
 * 3. Wallet signs PSBT → signed transaction
 * 4. Broadcast to Bitcoin network → outputs become available for pegin transactions
 *
 * @module utils/transaction/createSplitTransaction
 */

import {
  address as bitcoinAddress,
  networks,
  Psbt,
  Transaction,
} from "bitcoinjs-lib";
import { Buffer } from "buffer";

import type { Network } from "../../primitives";
import type { UTXO } from "../utxo/selectUtxos";

/**
 * Output specification for split transaction.
 */
export interface SplitOutput {
  /** Amount in satoshis */
  amount: bigint;
  /** Bitcoin address to send to */
  address: string;
}

/**
 * Result of creating a split transaction.
 */
export interface SplitTransactionResult {
  /** Unsigned transaction hex */
  txHex: string;
  /** Transaction ID (deterministic, calculated before signing) */
  txid: string;
  /** Output UTXOs that will be created when transaction is broadcast */
  outputs: Array<{
    /** Transaction ID of this output */
    txid: string;
    /** Output index */
    vout: number;
    /** Amount in satoshis */
    value: number;
    /** Script pubkey hex */
    scriptPubKey: string;
  }>;
}

/**
 * Create a UTXO split transaction.
 *
 * This function creates a Bitcoin transaction that takes input UTXOs
 * and splits them into multiple outputs with specified amounts.
 *
 * The transaction is returned unsigned. The caller must:
 * 1. Sign the transaction using a Bitcoin wallet
 * 2. Broadcast it to the Bitcoin network
 * 3. Use the output UTXOs for subsequent peg-in transactions
 *
 * @param inputs - Input UTXOs to split
 * @param outputs - Desired output amounts and addresses
 * @param network - Bitcoin network (mainnet, testnet, signet, regtest)
 * @returns Unsigned transaction hex, txid, and output UTXO references
 * @throws Error if inputs or outputs are empty
 * @throws Error if address decoding fails (invalid address for network)
 *
 * @example
 * ```typescript
 * const result = createSplitTransaction(
 *   [{ txid: "abc...", vout: 0, value: 100000, scriptPubKey: "..." }],
 *   [
 *     { amount: 50000n, address: "tb1p..." },
 *     { amount: 45000n, address: "tb1p..." }
 *   ],
 *   "testnet"
 * );
 * // result.txHex → unsigned transaction
 * // result.txid → deterministic transaction ID
 * // result.outputs → UTXO references for pegin creation
 * ```
 */
export function createSplitTransaction(
  inputs: UTXO[],
  outputs: SplitOutput[],
  network: Network,
): SplitTransactionResult {
  // Validate inputs
  if (inputs.length === 0) {
    throw new Error("No input UTXOs provided for split transaction");
  }

  if (outputs.length === 0) {
    throw new Error("No outputs specified for split transaction");
  }

  // Get bitcoinjs-lib network
  const btcNetwork = getNetwork(network);

  // Create transaction with BIP 68/112/113 compatibility
  const tx = new Transaction();
  tx.version = 2;

  // Add inputs
  for (const input of inputs) {
    // Bitcoin uses reversed byte order for txid
    const txidBuffer = Buffer.from(input.txid, "hex").reverse();
    tx.addInput(txidBuffer, input.vout);
  }

  // Add outputs
  const outputUtxos: SplitTransactionResult["outputs"] = [];

  for (let i = 0; i < outputs.length; i++) {
    const output = outputs[i];

    // Decode address to get script pubkey
    let outputScript: Buffer;
    try {
      const decoded = bitcoinAddress.toOutputScript(output.address, btcNetwork);
      outputScript = decoded;
    } catch (error) {
      throw new Error(
        `Failed to decode address "${output.address}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    tx.addOutput(outputScript, Number(output.amount));

    // Store output UTXO reference (will be created when tx is broadcast)
    outputUtxos.push({
      txid: "", // Will be set after txid calculation
      vout: i,
      value: Number(output.amount),
      scriptPubKey: outputScript.toString("hex"),
    });
  }

  // Get unsigned transaction hex
  const txHex = tx.toHex();

  // Calculate txid (this is deterministic for unsigned transactions)
  const txid = tx.getId();

  // Update output UTXO txids
  for (const output of outputUtxos) {
    output.txid = txid;
  }

  return {
    txHex,
    txid,
    outputs: outputUtxos,
  };
}

/**
 * Sign a split transaction using a PSBT.
 *
 * This function takes an unsigned split transaction and creates a PSBT
 * that can be signed by a Bitcoin wallet.
 *
 * The PSBT includes:
 * - witnessUtxo: Script and value for each input (required for P2TR)
 * - tapInternalKey: Depositor's x-only pubkey for Taproot signing
 *
 * Technical Note:
 * For P2TR (Taproot) inputs, we need the witnessUtxo and tapInternalKey.
 * This is different from legacy inputs which would need the full previous transaction.
 *
 * @param unsignedTxHex - Unsigned transaction hex from createSplitTransaction
 * @param inputs - Input UTXOs with full data for PSBT
 * @param publicKeyNoCoord - Depositor's public key (x-only, 32 bytes) for P2TR signing
 * @returns PSBT hex ready for wallet signing
 * @throws Error if UTXO data is missing for any input
 *
 * @example
 * ```typescript
 * const psbtHex = createSplitTransactionPsbt(
 *   result.txHex,
 *   inputUtxos,
 *   Buffer.from(depositorPubkeyXOnly, "hex")
 * );
 * // Sign via wallet
 * const signedPsbtHex = await wallet.signPsbt(psbtHex);
 * ```
 */
export function createSplitTransactionPsbt(
  unsignedTxHex: string,
  inputs: UTXO[],
  publicKeyNoCoord: Buffer,
): string {
  const tx = Transaction.fromHex(unsignedTxHex);
  const psbt = new Psbt();

  psbt.setVersion(tx.version);
  psbt.setLocktime(tx.locktime);

  // Add inputs with UTXO data for P2TR signing
  for (let i = 0; i < tx.ins.length; i++) {
    const input = tx.ins[i];
    const utxo = inputs[i];

    if (!utxo) {
      throw new Error(`Missing UTXO data for input ${i}`);
    }

    // For P2TR inputs, we need witnessUtxo and tapInternalKey
    const witnessUtxo = {
      script: Buffer.from(utxo.scriptPubKey, "hex"),
      value: utxo.value,
    };

    psbt.addInput({
      hash: input.hash,
      index: input.index,
      sequence: input.sequence,
      witnessUtxo,
      tapInternalKey: publicKeyNoCoord,
    });
  }

  // Add outputs
  for (const output of tx.outs) {
    psbt.addOutput({
      script: output.script,
      value: output.value,
    });
  }

  return psbt.toHex();
}

/**
 * Get bitcoinjs-lib network from SDK network enum.
 *
 * Maps the SDK's Network type to bitcoinjs-lib's network objects.
 * Note: bitcoinjs-lib doesn't have built-in signet support, so we use testnet params.
 *
 * @param network - SDK network enum
 * @returns bitcoinjs-lib Network object
 * @throws Error if network is unknown
 */
function getNetwork(network: Network): typeof networks.bitcoin {
  switch (network) {
    case "bitcoin":
      return networks.bitcoin;
    case "testnet":
      return networks.testnet;
    case "signet":
      // bitcoinjs-lib doesn't have signet, use testnet
      return networks.testnet;
    case "regtest":
      return networks.regtest;
    default:
      throw new Error(`Unknown network: ${network}`);
  }
}
