/**
 * Parser for unfunded WASM-generated Bitcoin transactions.
 *
 * This utility extracts transaction metadata and output information from
 * unfunded transactions produced by the btc-vault WASM module.
 *
 * ## Why Manual Parsing?
 *
 * The btc-vault WASM generates witness-format transactions with 0 inputs,
 * which bitcoinjs-lib cannot parse directly. The transaction format is:
 *
 * ```
 * [version:4bytes]
 * [marker:0x00][flag:0x01]  // SegWit markers (if present)
 * [inputs:1byte=0x00]
 * [outputs:1byte=0x01]
 * [value:8bytes]
 * [scriptLen:1byte]
 * [script:Nbytes]
 * [locktime:4bytes]
 * ```
 *
 * This parser manually extracts the transaction structure to enable
 * building funded transactions from the WASM template.
 */

/**
 * Parsed transaction data from unfunded WASM transaction
 */
export interface ParsedUnfundedTransaction {
  /** Transaction version (typically 2) */
  version: number;
  /** Transaction locktime */
  locktime: number;
  /** Vault output value in satoshis */
  vaultValue: number;
  /** Vault output script pubkey (Buffer) */
  vaultScript: Buffer;
}

/**
 * Parses an unfunded WASM transaction to extract metadata and vault output.
 *
 * This function manually parses the transaction hex because bitcoinjs-lib
 * cannot handle witness-format transactions with 0 inputs.
 *
 * @param unfundedTxHex - Hex string of unfunded transaction from WASM
 * @returns Parsed transaction metadata and vault output
 * @throws Error if transaction format is invalid or has unexpected structure
 *
 * @example
 * ```typescript
 * const parsed = parseUnfundedWasmTransaction(wasmTxHex);
 * console.log(`Vault value: ${parsed.vaultValue} sats`);
 * console.log(`Version: ${parsed.version}, Locktime: ${parsed.locktime}`);
 * ```
 */
export function parseUnfundedWasmTransaction(
  unfundedTxHex: string,
): ParsedUnfundedTransaction {
  // Check if witness markers are present (SegWit format)
  const hasWitnessMarkers = unfundedTxHex.substring(8, 12) === '0001';

  let dataOffset = 8; // Start after version (4 bytes = 8 hex chars)
  if (hasWitnessMarkers) {
    dataOffset += 4; // Skip witness marker (0x00) and flag (0x01)
  }

  // Parse structure manually
  const versionHex = unfundedTxHex.substring(0, 8);
  const inputCount = parseInt(unfundedTxHex.substring(dataOffset, dataOffset + 2), 16);
  const outputCount = parseInt(unfundedTxHex.substring(dataOffset + 2, dataOffset + 4), 16);

  // Validate expected structure from WASM (0 inputs, 1 output)
  if (inputCount !== 0) {
    throw new Error(
      `Invalid unfunded transaction: expected 0 inputs from WASM, got ${inputCount}`,
    );
  }
  if (outputCount !== 1) {
    throw new Error(
      `Invalid unfunded transaction: expected 1 output from WASM, got ${outputCount}`,
    );
  }

  // Extract vault output (starting after input/output counts)
  // dataOffset points to input count (1 byte) + output count (1 byte) = 2 bytes = 4 hex chars
  const outputDataStart = dataOffset + 4;
  const valueHex = unfundedTxHex.substring(outputDataStart, outputDataStart + 16); // 8 bytes = 16 hex chars
  const scriptLenPos = outputDataStart + 16;
  const scriptLen = parseInt(unfundedTxHex.substring(scriptLenPos, scriptLenPos + 2), 16);
  const scriptStart = scriptLenPos + 2;
  const scriptHex = unfundedTxHex.substring(scriptStart, scriptStart + scriptLen * 2);

  // Parse value as little-endian uint64
  const valueBuffer = Buffer.from(valueHex, 'hex');
  const vaultValue = Number(valueBuffer.readBigUInt64LE(0));
  const vaultScript = Buffer.from(scriptHex, 'hex');

  // Extract locktime (last 4 bytes = 8 hex chars)
  const locktimeHex = unfundedTxHex.substring(unfundedTxHex.length - 8);
  const locktimeBuffer = Buffer.from(locktimeHex, 'hex');
  const locktime = locktimeBuffer.readUInt32LE(0);

  // Extract version (first 4 bytes = 8 hex chars)
  const versionBuffer = Buffer.from(versionHex, 'hex');
  const version = versionBuffer.readUInt32LE(0);

  return {
    version,
    locktime,
    vaultValue,
    vaultScript,
  };
}
