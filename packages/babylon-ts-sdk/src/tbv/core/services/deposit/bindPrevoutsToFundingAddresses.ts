/**
 * Resume-path counterpart of the UTXO collector: bind each chain-resolved
 * input of a funded Pre-PegIn to the wallet's key that owns its script, from
 * the wallet's own funding addresses rather than anything stored. Establishes
 * which key signs an input, not that the script belongs to that outpoint —
 * the caller's outpoint-keyed resolution does that.
 */

import type { Network } from "@babylonlabs-io/babylon-tbv-rust-wasm";

import type { FundingAddress } from "../../deposit-terms";
import type { FundingPrevout } from "../../utils";
import { authorizedFundingScripts } from "./fundingAddressSet";

export interface BindPrevoutsToFundingAddressesParams {
  /** The transaction's inputs, keyed `txid:vout`, each resolved from the chain. */
  readonly prevouts: Readonly<
    Record<string, { readonly scriptPubKey: string; readonly value: number }>
  >;
  /** The wallet's funding addresses, from `getFundingAddresses()`. */
  readonly addresses: readonly FundingAddress[];
  /** Network the addresses are encoded for. */
  readonly network: Network;
}

/**
 * Bind every prevout to the funding address whose key owns its script.
 * All or nothing: an input owned by none of the addresses throws.
 */
export function bindPrevoutsToFundingAddresses(
  params: BindPrevoutsToFundingAddressesParams,
): Record<string, FundingPrevout> {
  const { prevouts, addresses, network } = params;
  const byScript = new Map(
    authorizedFundingScripts(addresses, network).map(
      ({ funding, scriptHex }) => [scriptHex, funding],
    ),
  );
  const entries = Object.entries(prevouts);
  if (entries.length === 0) {
    throw new Error(
      "The funded Pre-PegIn resolved no inputs; there is nothing to bind to a " +
        "funding address.",
    );
  }
  const bound: Record<string, FundingPrevout> = {};
  for (const [outpoint, prevout] of entries) {
    const scriptHex = prevout.scriptPubKey.toLowerCase();
    const owner = byScript.get(scriptHex);
    if (owner === undefined) {
      throw new Error(
        `Input ${outpoint} spends a script (${scriptHex}) that belongs to ` +
          `none of the connected wallet's funding addresses; it was funded ` +
          `from an address this wallet does not enumerate and cannot be ` +
          `signed here.`,
      );
    }
    bound[outpoint] = {
      scriptPubKey: scriptHex,
      value: prevout.value,
      internalPubkeyHex: owner.internalPubkeyHex.toLowerCase(),
    };
  }
  return bound;
}
