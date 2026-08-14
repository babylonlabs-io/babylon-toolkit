/**
 * Resolve every prevout of a funded Pre-PegIn tx and compute its fee
 * (inputs − outputs). Mempool-only — nothing the device approves may originate
 * in browser storage (`assertUtxosAvailable` already guarantees the inputs are
 * mempool-visible). Returns a COMPLETE record that the broadcast reuses
 * verbatim, so the fee in the rebuilt terms is the fee it signs (no drift).
 */

import { Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";

import { fetchUTXOFromMempool } from "./vaultUtxoDerivationService";

type UtxoRecord = Record<string, { scriptPubKey: string; value: number }>;

export async function resolveFundedTxFeeAndUtxos(
  fundedPrePeginTxHex: string,
): Promise<{ expectedUtxos: UtxoRecord; fundedTxFee: bigint }> {
  const cleanHex = fundedPrePeginTxHex.startsWith("0x")
    ? fundedPrePeginTxHex.slice(2)
    : fundedPrePeginTxHex;
  const tx = Transaction.fromHex(cleanHex);

  const expectedUtxos: UtxoRecord = {};
  let totalInputValue = 0n;
  for (const input of tx.ins) {
    // Bitcoin stores the prev-txid in reverse (internal) byte order.
    const txid = Buffer.from(input.hash).reverse().toString("hex");
    const key = `${txid}:${input.index}`;
    const utxo = await fetchUTXOFromMempool(txid, input.index);
    expectedUtxos[key] = utxo;
    totalInputValue += BigInt(utxo.value);
  }

  const totalOutputValue = tx.outs.reduce(
    (sum, o) => sum + BigInt(o.value),
    0n,
  );
  const fundedTxFee = totalInputValue - totalOutputValue;
  if (fundedTxFee <= 0n) {
    throw new Error(
      `The funded Pre-PegIn transaction's inputs do not cover its outputs ` +
        `plus a fee (computed fee: ${fundedTxFee} sats). Refusing to resume.`,
    );
  }

  return { expectedUtxos, fundedTxFee };
}
