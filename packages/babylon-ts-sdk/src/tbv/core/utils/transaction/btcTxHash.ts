/**
 * Bitcoin Transaction Hash Utilities
 *
 * Provides utilities for calculating Bitcoin transaction hashes in a way that matches
 * the contract's BtcUtils.hashBtcTx() implementation.
 */

import { Transaction } from "bitcoinjs-lib";
import type { Hex } from "viem";

/**
 * Calculate Bitcoin transaction hash
 *
 * This matches the contract's BtcUtils.hashBtcTx() implementation:
 * 1. Double SHA256 the transaction bytes
 * 2. Reverse the byte order (Bitcoin convention)
 *
 * The resulting hash is used as the unique vault identifier in the BTCVaultsManager contract.
 *
 * @param txHex - Transaction hex (with or without 0x prefix)
 * @returns The transaction hash as Hex (with 0x prefix)
 */
export function calculateBtcTxHash(txHex: string): Hex {
  // Remove 0x prefix if present
  const cleanHex = txHex.startsWith("0x") ? txHex.slice(2) : txHex;

  // Use bitcoinjs-lib to calculate transaction ID (already does double SHA256 + reverse)
  const tx = Transaction.fromHex(cleanHex);
  const txid = tx.getId();

  // Return with 0x prefix to match Ethereum hex format
  return `0x${txid}` as Hex;
}
