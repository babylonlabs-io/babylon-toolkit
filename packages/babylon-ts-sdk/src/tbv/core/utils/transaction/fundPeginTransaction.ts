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

import { BTC_DUST_SAT } from "../fee/constants";
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

/**
 * Funds an unfunded peg-in transaction by adding inputs and change output.
 *
 * Takes an unfunded transaction template (0 inputs, 1 vault output) from the SDK
 * and adds UTXO inputs and a change output to create a funded transaction ready
 * for wallet signing.
 *
 * Process:
 * 1. Manually extract vault output from SDK hex (bitcoinjs-lib cannot parse 0-input txs)
 * 2. Add inputs for each selected UTXO
 * 3. Add vault output at index 0
 * 4. Add change output if changeAmount > DUST_THRESHOLD
 * 5. Return transaction hex ready for wallet signing
 *
 * @param params - Transaction funding parameters
 * @returns Transaction hex string ready for wallet signing
 */
export function fundPeginTransaction(
  params: FundPeginTransactionParams,
): string {
  const { unfundedTxHex, selectedUTXOs, changeAddress, changeAmount, network } =
    params;

  // Extract vault output data from SDK hex manually
  // SDK produces witness-format transaction with 0 inputs, which bitcoinjs-lib cannot parse
  // Format: [version:4bytes][marker:0x00][flag:0x01][inputs:1byte=0x00][outputs:1byte=0x01][value:8bytes][scriptLen:1byte][script:34bytes][locktime:4bytes]

  // Check if witness markers are present
  const hasWitnessMarkers = unfundedTxHex.substring(8, 12) === "0001";

  let dataOffset = 8; // Start after version
  if (hasWitnessMarkers) {
    dataOffset += 4; // Skip witness marker (00) and flag (01)
  }

  // Parse structure manually
  const versionHex = unfundedTxHex.substring(0, 8);
  const inputCount = parseInt(
    unfundedTxHex.substring(dataOffset, dataOffset + 2),
    16,
  );
  const outputCount = parseInt(
    unfundedTxHex.substring(dataOffset + 2, dataOffset + 4),
    16,
  );

  if (inputCount !== 0) {
    throw new Error(`Expected 0 inputs from SDK, got ${inputCount}`);
  }
  if (outputCount !== 1) {
    throw new Error(`Expected 1 output from SDK, got ${outputCount}`);
  }

  // Extract vault output (starting after input/output counts)
  const outputDataStart = dataOffset + 4; // After input count (1 byte) and output count (1 byte)
  const valueHex = unfundedTxHex.substring(
    outputDataStart,
    outputDataStart + 16,
  ); // 8 bytes = 16 hex chars
  const scriptLenPos = outputDataStart + 16;
  const scriptLen = parseInt(
    unfundedTxHex.substring(scriptLenPos, scriptLenPos + 2),
    16,
  );
  const scriptStart = scriptLenPos + 2;
  const scriptHex = unfundedTxHex.substring(
    scriptStart,
    scriptStart + scriptLen * 2,
  );

  // Parse value as little-endian uint64
  const valueBuffer = Buffer.from(valueHex, "hex");
  const vaultValue = Number(valueBuffer.readBigUInt64LE(0));
  const vaultScript = Buffer.from(scriptHex, "hex");

  // Extract locktime (last 4 bytes)
  const locktimeHex = unfundedTxHex.substring(unfundedTxHex.length - 8);
  const locktimeBuffer = Buffer.from(locktimeHex, "hex");
  const locktime = locktimeBuffer.readUInt32LE(0);

  // Extract version
  const versionBuffer = Buffer.from(versionHex, "hex");
  const version = versionBuffer.readUInt32LE(0);

  // Create a new transaction with the extracted data
  const tx = new bitcoin.Transaction();
  tx.version = version;
  tx.locktime = locktime;

  // Add inputs from selected UTXOs
  for (const utxo of selectedUTXOs) {
    const txHash = Buffer.from(utxo.txid, "hex").reverse(); // Bitcoin uses reversed byte order
    tx.addInput(txHash, utxo.vout);
  }

  // Add the vault output
  tx.addOutput(vaultScript, vaultValue);

  // Add change output if above dust threshold
  if (changeAmount > BigInt(BTC_DUST_SAT)) {
    const changeScript = bitcoin.address.toOutputScript(changeAddress, network);
    tx.addOutput(changeScript, Number(changeAmount));
  }

  // Return transaction hex (not PSBT)
  // The wallet will sign this transaction directly
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
