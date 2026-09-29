import type { MempoolUTXO } from "@babylonlabs-io/ts-sdk";

import { createOverrideStore } from "./store";

/**
 * Number of synthetic UTXOs the wallet's spendable balance is split into for
 * the deposit form's fee estimate and funding-input-cap gating. Feeds only
 * `useDepositPageForm`; `useDepositFlow` keeps building from the real set, so
 * no synthetic outpoint can reach a PSBT or a wallet prompt.
 */
const utxoFragmentCountStore = createOverrideStore<number>();

export const useUtxoFragmentCountOverride = utxoFragmentCountStore.useValue;
export const setUtxoFragmentCountOverride = utxoFragmentCountStore.set;

export const UTXO_FRAGMENT_COUNT_MIN = 1;
export const UTXO_FRAGMENT_COUNT_MAX = 200;

const TXID_HEX_LENGTH = 64;

/**
 * Split the summed value of `utxos` evenly into `count` synthetic UTXOs with
 * unique outpoints and the first real UTXO's script, so the SDK selector
 * accepts them. Total value is preserved; the remainder lands on the first
 * fragment. Empty input passes through.
 */
export function fragmentUtxos(
  utxos: MempoolUTXO[],
  count: number,
): MempoolUTXO[] {
  if (utxos.length === 0) return utxos;
  const total = utxos.reduce((sum, utxo) => sum + utxo.value, 0);
  const base = Math.floor(total / count);
  const remainder = total - base * count;
  const { scriptPubKey } = utxos[0];
  return Array.from({ length: count }, (_, index) => ({
    txid: index.toString(16).padStart(TXID_HEX_LENGTH, "0"),
    vout: 0,
    value: index === 0 ? base + remainder : base,
    scriptPubKey,
    confirmed: true,
  }));
}
