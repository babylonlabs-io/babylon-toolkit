/**
 * WOTS keypair derivation for the delegated claim.
 *
 * The watchtower CLI's `start-claim` needs the depositor's secret WOTS hash
 * chains to commit π₁ into the Assert witness. They are never stored: they
 * are re-derived from the wallet on demand, through the same frozen path
 * that produced the on-chain `depositorWotsPkHash` at deposit time.
 *
 * @module services/delegated-claim/deriveClaimerWotsKeypair
 */

import type { BitcoinWallet } from "../../../../shared/wallets/interfaces";
import { deriveVaultRoot, expandWotsSeed } from "../../vault-secrets";
import type { VaultContextInput } from "../../vault-secrets";
import {
  validateWotsKeypairAgainstGraph,
  wotsKeypairFromSeed,
} from "../../wasm";

export interface DeriveClaimerWotsKeypairParams {
  /** Must implement `deriveContextHash` — the only wallet prompt in the claim. */
  btcWallet: BitcoinWallet;
  /** Same context that produced this vault's secrets at deposit time. */
  vaultContext: VaultContextInput;
  /** HTLC output index of this vault within the Pre-PegIn transaction. */
  htlcVout: number;
  /** JSON-serialized TxGraph the keypair must match. */
  txGraphJson: string;
  /** Graph version. Delegated claim requires 3. */
  txGraphVersion: number;
}

export interface ClaimerWotsKeypair {
  /**
   * Content of `wots_keypair.json`, ready to write verbatim. Secret and
   * single-use: never log it, never persist it beyond the claim, and never
   * reuse it — reuse across claims leaks the WOTS key.
   */
  wotsKeypairJson: string;
  /** `0x`-prefixed hash of the public keys, matching `depositorWotsPkHash`. */
  pkHash: string;
}

/**
 * Re-derives the depositor's WOTS keypair and checks it against the graph.
 *
 * The validation is the point of this function, not a formality: an unbound
 * keypair produces an Assert witness no verifier accepts, and that failure
 * would otherwise surface only after the Claim has been broadcast and the
 * PegIn UTXO is already spent.
 *
 * @throws If the wallet's derivation does not match the WOTS public keys the
 *         graph's Claim commits to.
 */
export async function deriveClaimerWotsKeypair(
  params: DeriveClaimerWotsKeypairParams,
): Promise<ClaimerWotsKeypair> {
  const root = await deriveVaultRoot(params.btcWallet, params.vaultContext);
  let wotsSeed: Uint8Array;
  try {
    wotsSeed = await expandWotsSeed(root, params.htlcVout);
  } finally {
    root.fill(0);
  }

  let derivation;
  try {
    derivation = await wotsKeypairFromSeed(wotsSeed);
  } finally {
    wotsSeed.fill(0);
  }

  await validateWotsKeypairAgainstGraph(
    params.txGraphVersion,
    derivation.keypair,
    params.txGraphJson,
  );

  return {
    wotsKeypairJson: JSON.stringify(derivation.keypair),
    pkHash: derivation.pk_hash,
  };
}
