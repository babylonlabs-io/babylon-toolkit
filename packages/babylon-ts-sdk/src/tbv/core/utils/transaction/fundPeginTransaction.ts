/**
 * Transaction Funding Utility for Peg-in Transactions
 *
 * This module funds an unfunded transaction template from the SDK by adding
 * UTXO inputs and change outputs, creating a transaction ready for wallet signing.
 *
 * Transaction Flow:
 * 1. SDK buildPeginPsbt() → unfunded transaction (0 inputs, vault + depositor claim outputs)
 * 2. selectUtxosForPegin() → select UTXOs and calculate fees
 * 3. fundPeginTransaction() → add inputs/change, create funded transaction
 *
 * Technical Note:
 * We manually extract the vault output from SDK hex instead of using bitcoinjs-lib
 * parsing because bitcoinjs-lib cannot parse 0-input transactions (even witness format).
 */

import * as bitcoin from "bitcoinjs-lib";
import { Buffer } from "buffer";

import type { Network } from "../../primitives";
import { DUST_THRESHOLD } from "../fee/constants";
import type { UTXO } from "../utxo/selectUtxos";

export interface FundPeginTransactionParams {
  /** Unfunded transaction hex from SDK (0 inputs, vault + depositor claim outputs) */
  unfundedTxHex: string;
  /** Selected UTXOs to use as inputs */
  selectedUTXOs: UTXO[];
  /** Change address (from wallet) */
  changeAddress: string;
  /** Change amount in satoshis */
  changeAmount: bigint;
  /** Bitcoin network */
  network: bitcoin.Network;
}

/** A single parsed output from the unfunded WASM transaction */
interface ParsedOutput {
  value: number;
  script: Buffer;
}

/** Parsed data from an unfunded WASM transaction */
interface ParsedUnfundedTx {
  version: number;
  locktime: number;
  outputs: ParsedOutput[];
}

/**
 * Parses an unfunded transaction hex from WASM.
 *
 * WASM produces witness-format transactions with 0 inputs, which bitcoinjs-lib cannot parse.
 * This function manually extracts the transaction components.
 *
 * Format: [version:4bytes][marker:0x00][flag:0x01][inputs:1byte=0x00][outputCount:1byte]
 *         [output1: value:8bytes + scriptLen:1byte + script:N bytes]
 *         [output2: ...]
 *         [locktime:4bytes]
 *
 * @param unfundedTxHex - Raw transaction hex from WASM
 * @returns Parsed transaction components
 * @throws Error if transaction structure is invalid
 */
export function parseUnfundedWasmTransaction(
  unfundedTxHex: string,
): ParsedUnfundedTx {
  // Check if witness markers are present (0x00 0x01 after version)
  const hasWitnessMarkers = unfundedTxHex.substring(8, 12) === "0001";
  const dataOffset = hasWitnessMarkers ? 12 : 8; // Skip version (8) + optional witness markers (4)

  // Parse input/output counts
  const inputCount = parseInt(
    unfundedTxHex.substring(dataOffset, dataOffset + 2),
    16,
  );
  const outputCount = parseInt(
    unfundedTxHex.substring(dataOffset + 2, dataOffset + 4),
    16,
  );

  if (inputCount !== 0) {
    throw new Error(`Expected 0 inputs from WASM, got ${inputCount}`);
  }
  if (outputCount === 0) {
    throw new Error("Expected at least 1 output from WASM, got 0");
  }

  // Parse version (first 4 bytes, little-endian)
  const version = Buffer.from(unfundedTxHex.substring(0, 8), "hex").readUInt32LE(0);

  // Parse locktime (last 4 bytes, little-endian)
  const locktime = Buffer.from(
    unfundedTxHex.substring(unfundedTxHex.length - 8),
    "hex",
  ).readUInt32LE(0);

  // Parse all outputs sequentially
  const outputs: ParsedOutput[] = [];
  let pos = dataOffset + 4; // position after input/output counts

  for (let i = 0; i < outputCount; i++) {
    const valueHex = unfundedTxHex.substring(pos, pos + 16);
    const value = Number(Buffer.from(valueHex, "hex").readBigUInt64LE(0));
    pos += 16;

    const scriptLen = parseInt(unfundedTxHex.substring(pos, pos + 2), 16);
    pos += 2;

    const scriptHex = unfundedTxHex.substring(pos, pos + scriptLen * 2);
    const script = Buffer.from(scriptHex, "hex");
    pos += scriptLen * 2;

    outputs.push({ value, script });
  }

  return { version, locktime, outputs };
}

/**
 * Funds an unfunded peg-in transaction by adding inputs and change output.
 *
 * Takes an unfunded transaction template (0 inputs, 1 vault output) from the SDK
 * and adds UTXO inputs and a change output to create a funded transaction ready
 * for wallet signing.
 *
 * @param params - Transaction funding parameters
 * @returns Transaction hex string ready for wallet signing
 */
export function fundPeginTransaction(
  params: FundPeginTransactionParams,
): string {
  const { unfundedTxHex, selectedUTXOs, changeAddress, changeAmount, network } =
    params;

  // Parse the unfunded transaction from WASM
  const { version, locktime, outputs } =
    parseUnfundedWasmTransaction(unfundedTxHex);

  // Create a new transaction with the extracted data
  const tx = new bitcoin.Transaction();
  tx.version = version;
  tx.locktime = locktime;

  // Add inputs from selected UTXOs
  for (const utxo of selectedUTXOs) {
    // Bitcoin uses reversed byte order for txid
    const txHash = Buffer.from(utxo.txid, "hex").reverse();
    tx.addInput(txHash, utxo.vout);
  }

  // Add all WASM outputs (vault output at index 0, depositor claim at index 1, etc.)
  for (const output of outputs) {
    tx.addOutput(output.script, output.value);
  }

  // Add change output if above dust threshold
  if (changeAmount > DUST_THRESHOLD) {
    const changeScript = bitcoin.address.toOutputScript(changeAddress, network);
    tx.addOutput(changeScript, Number(changeAmount));
  }

  return tx.toHex();
}

/**
 * Gets the network object from SDK network type.
 *
 * @param network - Network type ("bitcoin", "testnet", "signet", "regtest")
 * @returns bitcoinjs-lib Network object
 */
export function getNetwork(network: Network): bitcoin.Network {
  switch (network) {
    case "bitcoin":
      return bitcoin.networks.bitcoin;
    case "testnet":
      return bitcoin.networks.testnet;
    case "signet":
      // bitcoinjs-lib doesn't have a built-in signet network, use testnet params (tb1... addresses)
      return bitcoin.networks.testnet;
    case "regtest":
      // bitcoinjs-lib has a built-in regtest network with bcrt1... addresses
      return bitcoin.networks.regtest;
    default:
      throw new Error(`Unknown network: ${network}`);
  }
}
