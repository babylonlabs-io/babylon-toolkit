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

/**
 * Inputs for re-deriving the depositor's WOTS keypair at claim time.
 *
 * @experimental
 */
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
  /**
   * `depositorWotsPkHash` as the vault records it on chain, `0x`-prefixed.
   *
   * This is the only anchor here the vault provider does not supply. The
   * graph check below compares against VP-served bytes, so it cannot tell a
   * wrong `htlcVout`, a wrong wallet account, or expander drift after a
   * WASM re-pin from a correct derivation.
   */
  expectedWotsPkHash: string;
}

/**
 * The `wots_keypair.json` content and the hash it commits to.
 *
 * @experimental
 */
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
 * Re-derives the depositor's WOTS keypair and checks it against the vault's
 * on-chain commitment and against the graph.
 *
 * The validation is the point of this function, not a formality: an unbound
 * keypair produces an Assert witness no verifier accepts, and that failure
 * would otherwise surface only after the Claim has been broadcast and the
 * PegIn UTXO is already spent. The on-chain hash is checked first, because
 * it is the one value here the vault provider cannot choose.
 *
 * Experimental: this API can change in a minor release. Pin the SDK
 * version if you build on it.
 *
 * @throws If the derivation does not match the vault's on-chain
 *         `depositorWotsPkHash`, or the WOTS public keys the graph's Claim
 *         commits to.
 * @experimental
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

  assertMatchesOnChainHash(derivation.pk_hash, params.expectedWotsPkHash);

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

/**
 * Throws unless the derived public-key hash is the one the vault committed
 * to on chain at deposit time.
 */
function assertMatchesOnChainHash(derived: string, onChain: string): void {
  if (normalizeHash(derived) !== normalizeHash(onChain)) {
    throw new Error(
      `Derived WOTS public-key hash ${normalizeHash(derived)} does not match ` +
        `the vault's on-chain depositorWotsPkHash ${normalizeHash(onChain)}. ` +
        `The wallet, the HTLC output index, or the derivation itself is not ` +
        `the one this vault was created with.`,
    );
  }
}

function normalizeHash(hash: string): string {
  const bare = hash.startsWith("0x") ? hash.slice(2) : hash;
  return `0x${bare.toLowerCase()}`;
}
