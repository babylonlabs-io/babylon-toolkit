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

