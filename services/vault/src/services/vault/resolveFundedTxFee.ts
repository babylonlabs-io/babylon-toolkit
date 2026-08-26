/**
 * Resolve every prevout of a funded Pre-PegIn tx and compute its fee
 * (inputs − outputs). Mempool-only — nothing the device approves may originate
 * in browser storage (`assertUtxosAvailable` already guarantees the inputs are
 * mempool-visible). Returns a COMPLETE record that the broadcast reuses
 * verbatim, so the fee in the rebuilt terms is the fee it signs (no drift).
 *
 * The fee bounds here deliberately overlap `validateInputOutputBalance`
 * (vaultPeginBroadcastService) — this copy bounds the fee at the terms-minting
 * site, before the rebuild's chain reads and any device work.
 */

import { MAX_REASONABLE_FEE_SATS } from "@babylonlabs-io/ts-sdk";
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

  const resolvedInputs = await Promise.all(
    tx.ins.map(async (input) => {
      // Bitcoin stores the prev-txid in reverse (internal) byte order.
      const txid = Buffer.from(input.hash).reverse().toString("hex");
      const key = `${txid}:${input.index}`;
      const utxo = await fetchUTXOFromMempool(txid, input.index);
      return { key, utxo };
    }),
  );

  const expectedUtxos: UtxoRecord = {};
  let totalInputValue = 0n;
  for (const { key, utxo } of resolvedInputs) {
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
      `The funded Vault Creation transaction's inputs do not cover its outputs ` +
        `plus a fee (computed fee: ${fundedTxFee} sats). Refusing to resume.`,
    );
  }
  if (fundedTxFee > MAX_REASONABLE_FEE_SATS) {
    throw new Error(
      `The funded Vault Creation transaction's computed fee (${fundedTxFee} sats) ` +
        `exceeds the maximum reasonable fee (${MAX_REASONABLE_FEE_SATS} sats). ` +
        `This may indicate the mempool API returned manipulated UTXO data. ` +
        `Refusing to resume.`,
    );
  }

  return { expectedUtxos, fundedTxFee };
}
