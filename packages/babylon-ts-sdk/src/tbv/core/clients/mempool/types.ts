/**
 * Mempool API Types
 *
 * Type definitions for mempool.space API responses.
 *
 * @module clients/mempool/types
 */

/**
 * UTXO information from mempool API.
 */
export interface MempoolUTXO {
  txid: string;
  vout: number;
  value: number;
  scriptPubKey: string;
  confirmed: boolean;
}

/**
 * Transaction input from mempool API.
 */
export interface TxInput {
  txid: string;
  vout: number;
  prevout: {
    scriptpubkey: string;
    scriptpubkey_asm: string;
    scriptpubkey_type: string;
    scriptpubkey_address: string;
    value: number;
  };
  scriptsig: string;
  scriptsig_asm: string;
  witness: string[];
  is_coinbase: boolean;
  sequence: number;
}

/**
 * Transaction output from mempool API.
 */
export interface TxOutput {
  scriptpubkey: string;
  scriptpubkey_asm: string;
  scriptpubkey_type: string;
  scriptpubkey_address: string;
  value: number;
}

/**
 * Transaction status from mempool API.
 */
export interface TxStatus {
  confirmed: boolean;
  block_height?: number;
  block_hash?: string;
  block_time?: number;
}

/**
 * Spend status of a single transaction output, from the esplora-compatible
 * `GET /tx/{txid}/outspend/{vout}` endpoint served by the mempool.space
 * backend.
 *
 * Source: mempool/electrs `src/rest.rs` `SpendingValue` — an unspent output
 * serializes as `{ "spent": false }` (the optional fields use
 * `skip_serializing_if`); a spent output serializes as
 * `{ "spent": true, "txid", "vin", "status" }`.
 */
export interface OutspendStatus {
  /** True when the output has been spent (mempool or a block). */
  spent: boolean;
  /** Spending transaction id; present only when `spent`. */
  txid?: string;
  /** Input index within the spending tx; present only when `spent`. */
  vin?: number;
  /** Confirmation status of the spending tx; present only when `spent`. */
  status?: TxStatus;
}

/**
 * Full transaction info from mempool API.
 */
export interface TxInfo {
  txid: string;
  version: number;
  locktime: number;
  vin: TxInput[];
  vout: TxOutput[];
  size: number;
  weight: number;
  fee: number;
  status: TxStatus;
}

/**
 * UTXO info for a specific output (used for PSBT construction).
 *
 * Only supports Taproot (P2TR) and native SegWit (P2WPKH, P2WSH) script types.
 */
export interface UtxoInfo {
  txid: string;
  vout: number;
  value: number;
  scriptPubKey: string;
}

/**
 * Bitcoin network fee recommendations (sat/vbyte) from mempool.space API.
 *
 * @see https://mempool.space/docs/api/rest#get-recommended-fees
 */
export interface NetworkFees {
  /** Next block (~10 min) */
  fastestFee: number;
  /** ~30 minutes */
  halfHourFee: number;
  /** ~1 hour */
  hourFee: number;
  /** Economy (no time guarantee) */
  economyFee: number;
  /** Minimum network fee */
  minimumFee: number;
}

