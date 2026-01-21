/**
 * Bitcoin Utilities
 *
 * Centralized exports for Bitcoin-specific utility functions
 */

export { BitcoinScriptType, getScriptType } from "./btcScriptType";
export { processPublicKeyToXOnly, stripHexPrefix, toXOnly } from "./btcUtils";
export { TAP_INTERNAL_KEY, tapInternalPubkey } from "./constants";
export {
  getPsbtInputFields,
  type PsbtInputFields,
  type UTXO,
} from "./getPsbtInputFields";
