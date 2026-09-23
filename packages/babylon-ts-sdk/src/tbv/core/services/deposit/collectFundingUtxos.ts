/**
 * Collect the UTXOs of a policy wallet's funding addresses, each annotated
 * with the key that owns it.
 *
 * Trusts neither the provider's address/key pairing (each address is
 * re-derived from its key) nor the listing's script (derived locally and
 * asserted equal), and fails as a whole if any address cannot be listed.
 * It proves an address is ours, not that an outpoint is: the outpoint-keyed
 * check runs on the selected inputs before registration.
 */

import type { Network } from "@babylonlabs-io/babylon-tbv-rust-wasm";

import type { MempoolUTXO } from "../../clients/mempool";
import type { FundingAddress } from "../../deposit-terms";
import { outpointKey } from "../../utils";
import {
  authorizedFundingScripts,
  type FundingScript,
} from "./fundingAddressSet";

/** A wallet UTXO with the key and address that own it. */
export interface FundingUtxo extends MempoolUTXO {
  /** x-only internal key that owns `scriptPubKey` (64-char hex, no `0x`). */
  internalPubkeyHex: string;
  /** Address this UTXO was listed under. */
  address: string;
}

export interface CollectFundingUtxosParams {
  /** From `PrePeginFundingSource.getFundingAddresses()`; non-empty, no repeats. */
  addresses: readonly FundingAddress[];
  /** Network the addresses are encoded for — each one is re-derived against it. */
  network: Network;
  /** Lists one address's UTXOs, e.g. `(address) => getAddressUtxos(address, apiUrl)`. */
  listAddressUtxos: (address: string) => Promise<MempoolUTXO[]>;
}

/** List one funding address and bind every entry to its owning key. */
async function collectOneAddress(
  { funding, scriptHex: expectedScript }: FundingScript,
  listAddressUtxos: (address: string) => Promise<MempoolUTXO[]>,
): Promise<FundingUtxo[]> {
  let listed: MempoolUTXO[];
  try {
    listed = await listAddressUtxos(funding.address);
  } catch (cause) {
    throw new Error(
      `Could not list UTXOs for funding address ${funding.address}. The ` +
        `funding set is incomplete, so no balance or deposit may be built ` +
        `from it.`,
      { cause },
    );
  }

  return listed.map((utxo) => {
    if (utxo.scriptPubKey.toLowerCase() !== expectedScript) {
      throw new Error(
        `Funding address ${funding.address} does not own the script reported for ` +
          `${outpointKey(utxo.txid, utxo.vout)}: its key derives ` +
          `${expectedScript}, the listing reports ${utxo.scriptPubKey}.`,
      );
    }
    return {
      ...utxo,
      // Canonical lowercase hex throughout: the signing path keys inputs by
      // lowercase txid and the signer accepts only lowercase keys.
      txid: utxo.txid.toLowerCase(),
      scriptPubKey: expectedScript,
      internalPubkeyHex: funding.internalPubkeyHex.toLowerCase(),
      address: funding.address,
    };
  });
}

/**
 * Every UTXO across the wallet's funding addresses, each carrying its owning
 * key and address. All or nothing: any failed listing or foreign script throws.
 */
export async function collectFundingUtxos(
  params: CollectFundingUtxosParams,
): Promise<FundingUtxo[]> {
  const { addresses, network, listAddressUtxos } = params;
  const scripts = authorizedFundingScripts(addresses, network);

  const perAddress = await Promise.all(
    scripts.map((script) => collectOneAddress(script, listAddressUtxos)),
  );

  const byOutpoint = new Map<string, FundingUtxo>();
  for (const utxo of perAddress.flat()) {
    const key = outpointKey(utxo.txid, utxo.vout);
    const existing = byOutpoint.get(key);
    if (existing) {
      throw new Error(
        `Outpoint ${key} was listed twice (under ${existing.address} and ` +
          `${utxo.address}); its owning key is ambiguous.`,
      );
    }
    byOutpoint.set(key, utxo);
  }
  return [...byOutpoint.values()];
}
