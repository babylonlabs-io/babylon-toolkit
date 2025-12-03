/**
 * PSBT Input Field Construction
 *
 * Constructs the correct PSBT input fields for a given UTXO based on its script type.
 *
 * @module utils/btc/psbtInputFields
 */

import { Buffer } from "buffer";

import { BitcoinScriptType, getScriptType } from "./scriptType";

/**
 * PSBT input fields for supported script types (P2TR, P2WPKH, P2WSH).
 */
export interface PsbtInputFields {
  witnessUtxo?: {
    script: Buffer;
    value: number;
  };
  witnessScript?: Buffer;
  tapInternalKey?: Buffer;
}

/**
 * UTXO information for PSBT construction.
 *
 * Only supports Taproot (P2TR) and native SegWit (P2WPKH, P2WSH) script types.
 */
export interface UtxoForPsbt {
  /** Transaction ID of the UTXO */
  txid: string;
  /** Output index (vout) of the UTXO */
  vout: number;
  /** Value of the UTXO in satoshis */
  value: number;
  /** ScriptPubKey of the UTXO (hex string) */
  scriptPubKey: string;
  /** Witness script (required for P2WSH) */
  witnessScript?: string;
}

/**
 * Get PSBT input fields for a given UTXO based on its script type.
 *
 * Only supports Taproot (P2TR) and native SegWit (P2WPKH, P2WSH) script types.
 *
 * @param utxo - The unspent transaction output to process
 * @param publicKeyNoCoord - The x-only public key (32 bytes) for Taproot signing
 * @returns PSBT input fields object containing the necessary data
 * @throws Error if required input data is missing or unsupported script type
 */
export function getPsbtInputFields(
  utxo: UtxoForPsbt,
  publicKeyNoCoord?: Buffer,
): PsbtInputFields {
  const scriptPubKey = Buffer.from(utxo.scriptPubKey, "hex");
  const type = getScriptType(scriptPubKey);

  switch (type) {
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
      if (publicKeyNoCoord && publicKeyNoCoord.length !== 32) {
        throw new Error(
          `Invalid tapInternalKey length: expected 32 bytes, got ${publicKeyNoCoord.length}`,
        );
      }
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

