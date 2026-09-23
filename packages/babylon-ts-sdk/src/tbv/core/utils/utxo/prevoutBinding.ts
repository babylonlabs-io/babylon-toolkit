/**
 * Binding checks for Pre-PegIn funding prevouts.
 *
 * A Pre-PegIn funded from both BIP-86 branches spends scripts owned by
 * different keys, so each input carries its own key. Two checks pin an input:
 * the key must own the declared script ({@link assertKeyOwnsScript}), and the
 * script and value must equal the chain's for that outpoint
 * ({@link assertPrevoutMatchesChain}). Only the second catches a `/1/0`
 * outpoint labelled with a consistent `/0/0` key and script.
 */

import { Buffer } from "buffer";

import {
  deriveBip86ScriptPubKeyHex,
  stripHexPrefix,
} from "../../primitives/utils/bitcoin";
import { BitcoinScriptType, getScriptType } from "../btc/scriptType";
import { HEX_RE, X_ONLY_PUBKEY_HEX_LEN } from "../validation";

/** True for an x-only public key in hex, no `0x` prefix. */
export function isXOnlyPubkeyHex(value: string): boolean {
  return value.length === X_ONLY_PUBKEY_HEX_LEN && HEX_RE.test(value);
}

/** Prevout data a caller supplies for one funding input. */
export interface FundingPrevout {
  /** scriptPubKey of the outpoint, hex. */
  scriptPubKey: string;
  /** Value of the outpoint, satoshis. */
  value: number;
  /**
   * x-only key that owns `scriptPubKey` (64-char hex, no `0x`). Set on every
   * prevout for multi-address funding; omitted for single-address funding.
   */
  internalPubkeyHex?: string;
}

/** `txid:vout` key of a prevout record. */
export const outpointKey = (txid: string, vout: number): string =>
  `${txid}:${vout}`;

/** True when any prevout declares a key; the whole set is then multi-address. */
export function isMultiAddressFunding(
  prevouts: Record<string, FundingPrevout> | undefined,
): boolean {
  return Object.values(prevouts ?? {}).some(
    (prevout) => prevout.internalPubkeyHex !== undefined,
  );
}

/** The declared prevout for an outpoint, with its key; never falls back to the depositor key. */
export function requireFundingPrevout(
  prevouts: Record<string, FundingPrevout> | undefined,
  txid: string,
  vout: number,
): FundingPrevout & { internalPubkeyHex: string } {
  const key = outpointKey(txid, vout);
  const prevout = prevouts?.[key];
  if (!prevout) {
    throw new Error(
      `No funding prevout declared for ${key}. Multi-address funding requires ` +
        `a prevout with its owning key for every input.`,
    );
  }
  if (prevout.internalPubkeyHex === undefined) {
    throw new Error(
      `Funding prevout ${key} carries no internalPubkeyHex. Every input must ` +
        `declare the key that owns it when funding spans several addresses.`,
    );
  }
  return { ...prevout, internalPubkeyHex: prevout.internalPubkeyHex };
}

/**
 * Assert the declared key derives the declared scriptPubKey (BIP-86, no
 * script tree — the same derivation the Ledger signer matches a `tr(@0/**)`
 * policy against). Only P2TR prevouts are accepted.
 */
export function assertKeyOwnsScript(
  key: string,
  internalPubkeyHex: string,
  scriptPubKey: string,
): void {
  if (!isXOnlyPubkeyHex(internalPubkeyHex)) {
    throw new Error(
      `Funding prevout ${key} has an invalid internalPubkeyHex: expected 64 ` +
        `hex characters (x-only, no 0x prefix), got "${internalPubkeyHex}".`,
    );
  }
  const scriptType = getScriptType(Buffer.from(scriptPubKey, "hex"));
  if (scriptType !== BitcoinScriptType.P2TR) {
    throw new Error(
      `Funding prevout ${key} declares an owning key but its script is ` +
        `${scriptType}, not P2TR. Per-input key ownership is only derivable ` +
        `for BIP-86 taproot prevouts.`,
    );
  }
  // An off-curve key throws inside the tweak (bitcoinjs-lib 6.1.7
  // `p2tr.js:203`) without naming the outpoint; re-raise with one.
  let derived: string;
  try {
    derived = stripHexPrefix(deriveBip86ScriptPubKeyHex(internalPubkeyHex));
  } catch (cause) {
    throw new Error(
      `Funding prevout ${key} has an internalPubkeyHex that is not a valid ` +
        `x-only public key on the secp256k1 curve.`,
      { cause },
    );
  }
  if (derived.toLowerCase() !== scriptPubKey.toLowerCase()) {
    throw new Error(
      `Funding prevout ${key} key does not own its script: the declared key ` +
        `derives ${derived}, but the prevout declares ${scriptPubKey}.`,
    );
  }
}

/**
 * Assert the declared prevout equals the chain's for that outpoint. `chain`
 * must come from an outpoint-keyed read (`getUtxoInfo`), not an address
 * listing, which stamps one script on every entry.
 */
export function assertPrevoutMatchesChain(
  key: string,
  declared: FundingPrevout,
  chain: { scriptPubKey: string; value: number },
): void {
  if (
    declared.scriptPubKey.toLowerCase() !== chain.scriptPubKey.toLowerCase()
  ) {
    throw new Error(
      `Funding prevout ${key} script does not match the chain: declared ` +
        `${declared.scriptPubKey}, chain reports ${chain.scriptPubKey}. The ` +
        `input was labelled with another address's script.`,
    );
  }
  if (declared.value !== chain.value) {
    throw new Error(
      `Funding prevout ${key} value does not match the chain: declared ` +
        `${declared.value} sat, chain reports ${chain.value} sat.`,
    );
  }
}
