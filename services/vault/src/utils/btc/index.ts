/**
 * Bitcoin Utilities
 *
 * Centralized exports for Bitcoin-specific utility functions
 */

export { BitcoinScriptType, getScriptType } from "./btcScriptType";
export {
  btcAddressToScriptPubKeyHex,
  deriveBip86ScriptPubKeyHex,
  processPublicKeyToXOnly,
  signPsbtsWithFallback,
  stripHexPrefix,
  toXOnly,
  validateXOnlyPubkey,
} from "./btcUtils";
export { TAP_INTERNAL_KEY, tapInternalPubkey } from "./constants";
export {
  getPsbtInputFields,
  type PsbtInputFields,
  type UTXO,
} from "./getPsbtInputFields";
