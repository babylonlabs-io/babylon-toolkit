/**
 * Mempool API Client
 *
 * Client for interacting with mempool.space API for Bitcoin network operations.
 *
 * @module clients/mempool
 */

export {
  MEMPOOL_API_URLS,
  getAddressTxs,
  getAddressUtxos,
  getMempoolApiUrl,
  getNetworkFees,
  getTxHex,
  getTxInfo,
  getUtxoInfo,
  pushTx,
} from "./mempoolApi";

export type { AddressTx } from "./mempoolApi";

export type {
  MempoolUTXO,
  NetworkFees,
  TxInfo,
  TxInput,
  TxOutput,
  TxStatus,
  UtxoInfo,
} from "./types";
