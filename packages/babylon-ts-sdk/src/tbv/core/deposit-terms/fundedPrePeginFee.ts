/**
 * Fee of a funded Pre-PegIn: Σ prevouts − Σ outputs, prevouts resolved from
 * the mempool API by display-order txid. Becomes the device's
 * `prepegin_max_fee` bound. Mirrors the vault app's
 * `resolveFundedTxFeeAndUtxos`, without the UTXO record the broadcast reuses.
 *
 * @module deposit-terms/fundedPrePeginFee
 */

import { Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";

import { getUtxoInfo } from "../clients/mempool";
import { stripHexPrefix } from "../primitives/utils/bitcoin";
import { MAX_REASONABLE_FEE_SATS } from "../utils/validation";

/**
 * @throws When the inputs do not cover the outputs, or the fee exceeds
 *         `MAX_REASONABLE_FEE_SATS` (a manipulated prevout answer).
 * @experimental
 */
export async function computeFundedPrePeginFee(
  fundedPrePeginTxHex: string,
  mempoolApiUrl: string,
): Promise<bigint> {
  const tx = Transaction.fromHex(stripHexPrefix(fundedPrePeginTxHex));
  const prevouts = await Promise.all(
    tx.ins.map((input) =>
      // Bitcoin stores the prev-txid in reverse (internal) byte order.
      getUtxoInfo(
        Buffer.from(input.hash).reverse().toString("hex"),
        input.index,
        mempoolApiUrl,
      ),
    ),
  );
  const totalIn = prevouts.reduce((sum, u) => sum + BigInt(u.value), 0n);
  const totalOut = tx.outs.reduce((sum, o) => sum + BigInt(o.value), 0n);
  const fee = totalIn - totalOut;
  if (fee <= 0n) {
    throw new Error(
      `The funded Pre-PegIn transaction's inputs do not cover its outputs plus a fee ` +
        `(computed fee: ${fee} sats).`,
    );
  }
  if (fee > MAX_REASONABLE_FEE_SATS) {
    throw new Error(
      `The funded Pre-PegIn transaction's computed fee (${fee} sats) exceeds the maximum ` +
        `reasonable fee (${MAX_REASONABLE_FEE_SATS} sats); the mempool API may have ` +
        `returned manipulated prevout data.`,
    );
  }
  return fee;
}
