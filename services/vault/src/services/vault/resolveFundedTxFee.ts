/**
 * Resolve every prevout of a funded Pre-PegIn tx once and compute its fee
 * (Σ input prevout values − Σ outputs).
 *
 * Same-device prevouts come from the trusted construction-time set; cross-device
 * ones from the mempool (safe pre-broadcast — the outpoints are still unspent,
 * `assertUtxosAvailable` guarantees it). Returns a COMPLETE `expectedUtxos`
 * record so `broadcastPrePeginTransaction` reuses these exact prevouts and never
 * re-resolves — the fee that feeds the rebuilt DepositTerms is then the SAME
 * `Σin − Σout` the broadcast will actually sign (no drift).
 */

import { Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";

import { fetchUTXOFromMempool } from "./vaultUtxoDerivationService";

type UtxoRecord = Record<string, { scriptPubKey: string; value: number }>;

export async function resolveFundedTxFeeAndUtxos(
  fundedPrePeginTxHex: string,
  sameDeviceUtxos: UtxoRecord | undefined,
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
    const utxo =
      sameDeviceUtxos?.[key] ?? (await fetchUTXOFromMempool(txid, input.index));
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
      `Funded Pre-PegIn tx fee (Σin − Σout) is ${fundedTxFee}; expected > 0. ` +
        `Refusing to resume.`,
    );
  }

  return { expectedUtxos, fundedTxFee };
}
