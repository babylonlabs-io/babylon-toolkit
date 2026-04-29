/**
 * Parse a Pre-PegIn transaction's inputs into the vault-context
 * `fundingOutpoints` shape consumed by `deriveVaultRoot`. Reverses
 * the prev-txid bytes from wire-internal little-endian to display
 * order so the derivation is byte-for-byte identical to the
 * deposit-time computation.
 *
 * @module vault-secrets/parseFundingOutpoints
 */

import { Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";

import type { FundingOutpoint } from "./context";

export function parseFundingOutpointsFromTx(
  unsignedTxHex: string,
): FundingOutpoint[] {
  if (!unsignedTxHex) {
    throw new Error("Pre-pegin transaction hex is empty");
  }
  const cleanHex = unsignedTxHex.startsWith("0x")
    ? unsignedTxHex.slice(2)
    : unsignedTxHex;
  const tx = Transaction.fromHex(cleanHex);
  if (tx.ins.length === 0) {
    throw new Error("Pre-pegin transaction has no inputs");
  }
  return tx.ins.map((input) => ({
    txid: Uint8Array.from(Buffer.from(input.hash).reverse()),
    vout: input.index,
  }));
}
