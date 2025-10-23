/**
 * Bitcoin Utilities
 *
 * Centralized exports for Bitcoin-specific utility functions
 */

export { BitcoinScriptType, getScriptType } from './btcScriptType';
export {
  stripHexPrefix,
  toXOnly,
  processPublicKeyToXOnly,
} from './btcUtils';
export {
  type PsbtInputFields,
  type UTXO,
  getPsbtInputFields,
} from './getPsbtInputFields';
export { TAP_INTERNAL_KEY, tapInternalPubkey } from './constants';
export {
  type Network,
  type PegInParams,
  type PegInResult,
  type PayoutConnectorParams,
  type PayoutConnectorInfo,
  createPegInTransaction,
  createPayoutConnector,
  WasmPeginTx,
  WasmPeginPayoutConnector,
} from './wasm';
