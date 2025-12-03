/**
 * Bitcoin Script Type Detection
 *
 * Utilities to detect Bitcoin script types for proper PSBT input construction.
 *
 * @module utils/btc/scriptType
 */

/**
 * Bitcoin script types.
 */
export enum BitcoinScriptType {
  P2PKH = "P2PKH",
  P2SH = "P2SH",
  P2WPKH = "P2WPKH",
  P2WSH = "P2WSH",
  P2TR = "P2TR",
  UNKNOWN = "UNKNOWN",
}

/**
 * Detect the type of a Bitcoin script.
 *
 * @param scriptPubKey - The script public key buffer
 * @returns The detected script type
 *
 * @example
 * ```typescript
 * const scriptType = getScriptType(Buffer.from(scriptPubKeyHex, 'hex'));
 * if (scriptType === BitcoinScriptType.P2TR) {
 *   // Handle Taproot input
 * }
 * ```
 */
export function getScriptType(scriptPubKey: Buffer): BitcoinScriptType {
  const length = scriptPubKey.length;

  // P2PKH: OP_DUP OP_HASH160 <20 bytes> OP_EQUALVERIFY OP_CHECKSIG (25 bytes)
  if (
    length === 25 &&
    scriptPubKey[0] === 0x76 && // OP_DUP
    scriptPubKey[1] === 0xa9 && // OP_HASH160
    scriptPubKey[2] === 0x14 && // Push 20 bytes
    scriptPubKey[23] === 0x88 && // OP_EQUALVERIFY
    scriptPubKey[24] === 0xac // OP_CHECKSIG
  ) {
    return BitcoinScriptType.P2PKH;
  }

  // P2SH: OP_HASH160 <20 bytes> OP_EQUAL (23 bytes)
  if (
    length === 23 &&
    scriptPubKey[0] === 0xa9 && // OP_HASH160
    scriptPubKey[1] === 0x14 && // Push 20 bytes
    scriptPubKey[22] === 0x87 // OP_EQUAL
  ) {
    return BitcoinScriptType.P2SH;
  }

  // P2WPKH: OP_0 <20 bytes> (22 bytes)
  if (
    length === 22 &&
    scriptPubKey[0] === 0x00 && // OP_0
    scriptPubKey[1] === 0x14 // Push 20 bytes
  ) {
    return BitcoinScriptType.P2WPKH;
  }

  // P2WSH: OP_0 <32 bytes> (34 bytes)
  if (
    length === 34 &&
    scriptPubKey[0] === 0x00 && // OP_0
    scriptPubKey[1] === 0x20 // Push 32 bytes
  ) {
    return BitcoinScriptType.P2WSH;
  }

  // P2TR (Taproot): OP_1 <32 bytes> (34 bytes)
  if (
    length === 34 &&
    scriptPubKey[0] === 0x51 && // OP_1
    scriptPubKey[1] === 0x20 // Push 32 bytes
  ) {
    return BitcoinScriptType.P2TR;
  }

  return BitcoinScriptType.UNKNOWN;
}

