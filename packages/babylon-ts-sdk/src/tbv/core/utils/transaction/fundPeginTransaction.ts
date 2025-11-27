/**
 * Transaction Funding Utility for Peg-in Transactions
 *
 * This module funds an unfunded transaction template from the SDK by adding
 * UTXO inputs and change outputs, creating a transaction ready for wallet signing.
 *
 * Transaction Flow:
 * 1. SDK buildPeginPsbt() → unfunded transaction (0 inputs, 1 vault output)
 * 2. selectUtxosForPegin() → select UTXOs and calculate fees
 * 3. fundPeginTransaction() → add inputs/change, create funded transaction
 *
 * Technical Note:
 * We manually extract the vault output from SDK hex instead of using bitcoinjs-lib
 * parsing because bitcoinjs-lib cannot parse 0-input transactions (even witness format).
 */

import * as bitcoin from "bitcoinjs-lib";
import { Buffer } from "buffer";

import { DUST_THRESHOLD } from "../fee/constants";
import type { UTXO } from "../utxo/selectUtxos";

export interface FundPeginTransactionParams {
  /** Unfunded transaction hex from SDK (0 inputs, 1 vault output) */
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

/** Parsed data from an unfunded WASM transaction */
interface ParsedUnfundedTx {
  version: number;
  locktime: number;
  vaultValue: number;
  vaultScript: Buffer;
}

/**
 * Parses an unfunded transaction hex from WASM.
 *
 * WASM produces witness-format transactions with 0 inputs, which bitcoinjs-lib cannot parse.
 * This function manually extracts the transaction components.
 *
 * Format: [version:4bytes][marker:0x00][flag:0x01][inputs:1byte=0x00][outputs:1byte=0x01]
 *         [value:8bytes][scriptLen:1byte][script:N bytes][locktime:4bytes]
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
  let dataOffset = hasWitnessMarkers ? 12 : 8; // Skip version (8) + optional witness markers (4)

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
  if (outputCount !== 1) {
    throw new Error(`Expected 1 output from WASM, got ${outputCount}`);
  }

  // Extract vault output (after input/output counts)
  const outputDataStart = dataOffset + 4;
  const valueHex = unfundedTxHex.substring(
    outputDataStart,
    outputDataStart + 16,
  );
  const scriptLenPos = outputDataStart + 16;
  const scriptLen = parseInt(
    unfundedTxHex.substring(scriptLenPos, scriptLenPos + 2),
    16,
  );
  const scriptHex = unfundedTxHex.substring(
    scriptLenPos + 2,
    scriptLenPos + 2 + scriptLen * 2,
  );

  // Parse version (first 4 bytes, little-endian)
  const version = Buffer.from(unfundedTxHex.substring(0, 8), "hex").readUInt32LE(0);

  // Parse locktime (last 4 bytes, little-endian)
  const locktime = Buffer.from(
    unfundedTxHex.substring(unfundedTxHex.length - 8),
    "hex",
  ).readUInt32LE(0);

  // Parse vault output value (little-endian uint64)
  const vaultValue = Number(Buffer.from(valueHex, "hex").readBigUInt64LE(0));
  const vaultScript = Buffer.from(scriptHex, "hex");

  return { version, locktime, vaultValue, vaultScript };
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
  const { version, locktime, vaultValue, vaultScript } =
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

  // Add the vault output at index 0
  tx.addOutput(vaultScript, vaultValue);

  // Add change output if above dust threshold
  if (changeAmount > DUST_THRESHOLD) {
    const changeScript = bitcoin.address.toOutputScript(changeAddress, network);
    tx.addOutput(changeScript, Number(changeAmount));
  }

  return tx.toHex();
}

/**
 * Gets the network object from network string.
 *
 * @param networkStr - Network string ("mainnet", "testnet", "signet", "regtest")
 * @returns bitcoinjs-lib Network object
 */
export function getNetwork(networkStr: string): bitcoin.Network {
  switch (networkStr.toLowerCase()) {
    case "mainnet":
    case "bitcoin":
      return bitcoin.networks.bitcoin;
    case "testnet":
      return bitcoin.networks.testnet;
    case "signet":
    case "regtest":
      // bitcoinjs-lib doesn't have built-in signet/regtest, use testnet params
      return bitcoin.networks.testnet;
    default:
      throw new Error(`Unknown network: ${networkStr}`);
  }
}
