/**
 * Bitcoin Utilities
 *
 * Utilities for Bitcoin script detection and PSBT construction.
 *
 * @module utils/btc
 */

export { BitcoinScriptType, getScriptType } from "./scriptType";
export {
  getPsbtInputFields,
  type PsbtInputFields,
  type UtxoForPsbt,
} from "./psbtInputFields";

