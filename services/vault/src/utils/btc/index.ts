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
export {
  WasmPeginPayoutConnector,
  WasmPeginTx,
  createPayoutConnector,
  createPegInTransaction,
  type Network,
  type PayoutConnectorInfo,
  type PayoutConnectorParams,
  type PegInParams,
  type PegInResult,
} from "./wasm";
