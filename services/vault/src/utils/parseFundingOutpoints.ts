/**
 * Parse pre-pegin tx inputs into vault-context fundingOutpoints.
 * Used by the resume flow. Reverses prev-txid bytes from wire (LE) to
 * display order so resume matches deposit-time encoding byte-for-byte.
 */

import type { FundingOutpoint } from "@babylonlabs-io/ts-sdk/tbv/core";
import { Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";

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
