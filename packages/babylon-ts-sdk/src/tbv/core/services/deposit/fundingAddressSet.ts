/**
 * Validation of a policy wallet's funding-address set and the BIP-86 script
 * each address owns; shared by the UTXO collector and the resume-path binder.
 */

import type { Network } from "@babylonlabs-io/babylon-tbv-rust-wasm";

import type { FundingAddress } from "../../deposit-terms";
import {
  deriveBip86ScriptPubKeyHex,
  deriveTaprootAddress,
} from "../../primitives";
import { stripHexPrefix } from "../../primitives/utils/bitcoin";
import { isXOnlyPubkeyHex } from "../../utils";

/** A validated funding address with the scriptPubKey its key owns (lowercase hex). */
export interface FundingScript {
  readonly funding: FundingAddress;
  readonly scriptHex: string;
}

/** Reject an empty, malformed or ambiguous set before any network read. */
function assertDistinctFundingAddresses(
  addresses: readonly FundingAddress[],
  network: Network,
): void {
  if (addresses.length === 0) {
    throw new Error(
      "The wallet reported no funding addresses. A funding source must at " +
        "least include the connected receive address.",
    );
  }
  // A duplicate key shows up as a duplicate address: the pairing check below
  // makes the address a function of the key.
  const seenAddresses = new Set<string>();
  for (const funding of addresses) {
    // The provider side is duck-typed; a wrong shape must fail here, by name.
    if (
      typeof funding.address !== "string" ||
      typeof funding.internalPubkeyHex !== "string"
    ) {
      throw new Error(
        `A funding address is missing its address or owning key; the wallet ` +
          `reported ${JSON.stringify(funding)}.`,
      );
    }
    if (!isXOnlyPubkeyHex(funding.internalPubkeyHex)) {
      throw new Error(
        `Funding address ${funding.address} reported an invalid ` +
          `internalPubkeyHex: expected 64 hex characters (x-only, no 0x ` +
          `prefix), got "${funding.internalPubkeyHex}".`,
      );
    }
    // The pairing, not just the parts: re-derive the address from its own key.
    let derivedAddress: string;
    try {
      derivedAddress = deriveTaprootAddress(funding.internalPubkeyHex, network);
    } catch (cause) {
      throw new Error(
        `Funding address ${funding.address} reported an internalPubkeyHex ` +
          `that is not a valid x-only public key on the secp256k1 curve.`,
        { cause },
      );
    }
    if (funding.address !== derivedAddress) {
      throw new Error(
        `Funding address ${funding.address} is not the address its own key ` +
          `derives on ${network} (${derivedAddress}); the address and the key ` +
          `come from different addresses.`,
      );
    }
    if (seenAddresses.has(funding.address)) {
      throw new Error(`Funding address ${funding.address} was listed twice.`);
    }
    seenAddresses.add(funding.address);
  }
}

/** Validate the set and derive, from each address's own key, the script it owns. */
export function authorizedFundingScripts(
  addresses: readonly FundingAddress[],
  network: Network,
): readonly FundingScript[] {
  assertDistinctFundingAddresses(addresses, network);
  return addresses.map((funding) => ({
    funding,
    scriptHex: stripHexPrefix(
      deriveBip86ScriptPubKeyHex(funding.internalPubkeyHex),
    ).toLowerCase(),
  }));
}
