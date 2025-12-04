/**
 * PSBT Input Field Construction
 *
 * Determines and constructs the correct PSBT input fields for a given UTXO based on its script type.
 * Handles different Bitcoin script types (P2PKH, P2SH, P2WPKH, P2WSH, P2TR) and returns
 * the appropriate PSBT input fields required for that UTXO.
 */

import { Buffer } from "buffer";

import { BitcoinScriptType, getScriptType } from "./btcScriptType";

/**
 * PSBT input fields (subset of PsbtInputExtended from bip174)
 * Only includes fields we use for different script types
 */
export interface PsbtInputFields {
  nonWitnessUtxo?: Buffer;
  witnessUtxo?: {
    script: Buffer;
    value: number;
  };
  redeemScript?: Buffer;
  witnessScript?: Buffer;
  tapInternalKey?: Buffer;
}

/**
 * UTXO information for PSBT construction
 */
export interface UTXO {
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
  value: number;

  /**
   * ScriptPubKey of the UTXO (hex string)
   */
  scriptPubKey: string;

  /**
   * Raw transaction hex (required for P2PKH and P2SH)
   */
  rawTxHex?: string;

  /**
   * Redeem script (required for P2SH)
   */
  redeemScript?: string;

  /**
   * Witness script (required for P2WSH)
   */
  witnessScript?: string;
}

/**
 * Get PSBT input fields for a given UTXO based on its script type
 *
 * @param utxo - The unspent transaction output to process
 * @param publicKeyNoCoord - The x-only public key (32 bytes, no coordinate prefix) for Taproot signing
 * @returns PSBT input fields object containing the necessary data
 * @throws Error if required input data is missing or if an unsupported script type is provided
 */
export function getPsbtInputFields(
  utxo: UTXO,
  publicKeyNoCoord?: Buffer,
): PsbtInputFields {
  const scriptPubKey = Buffer.from(utxo.scriptPubKey, "hex");
  const type = getScriptType(scriptPubKey);

  switch (type) {
    case BitcoinScriptType.P2PKH: {
      if (!utxo.rawTxHex) {
        throw new Error("Missing rawTxHex for legacy P2PKH input");
      }
      return { nonWitnessUtxo: Buffer.from(utxo.rawTxHex, "hex") };
    }

    case BitcoinScriptType.P2SH: {
      if (!utxo.rawTxHex) {
        throw new Error("Missing rawTxHex for P2SH input");
      }
      if (!utxo.redeemScript) {
        throw new Error("Missing redeemScript for P2SH input");
      }
      return {
        nonWitnessUtxo: Buffer.from(utxo.rawTxHex, "hex"),
        redeemScript: Buffer.from(utxo.redeemScript, "hex"),
      };
    }

    case BitcoinScriptType.P2WPKH: {
      return {
        witnessUtxo: {
          script: scriptPubKey,
          value: utxo.value,
        },
      };
    }

    case BitcoinScriptType.P2WSH: {
      if (!utxo.witnessScript) {
        throw new Error("Missing witnessScript for P2WSH input");
      }
      return {
        witnessUtxo: {
          script: scriptPubKey,
          value: utxo.value,
        },
        witnessScript: Buffer.from(utxo.witnessScript, "hex"),
      };
    }

    case BitcoinScriptType.P2TR: {
      return {
        witnessUtxo: {
          script: scriptPubKey,
          value: utxo.value,
        },
        // tapInternalKey is needed for Taproot signing
        ...(publicKeyNoCoord && { tapInternalKey: publicKeyNoCoord }),
      };
    }

    default:
      throw new Error(`Unsupported script type: ${type}`);
  }
}
