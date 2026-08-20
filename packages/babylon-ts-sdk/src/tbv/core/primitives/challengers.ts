/**
 * Challenger derivation utilities — counting local challengers for UI-level
 * validation (e.g. minimum deposit amounts) and deriving the exact
 * local-challenger set a claimer's tx graph is built from.
 */

import { processPublicKeyToXOnly } from "./utils/bitcoin";

/**
 * Normalize a public key to lowercase x-only hex for reliable comparison.
 *
 * Handles `0x` prefixes, compressed (33-byte), and uncompressed (65-byte) keys.
 */
function normalizeKey(key: string): string {
  return processPublicKeyToXOnly(key).toLowerCase();
}

/**
 * Compute the number of local challengers for a vault.
 *
 * Mirrors the VP's `compute_num_challengers()` logic:
 * local challengers = {vault_provider} ∪ {vault_keepers} − {depositor}
 *
 * Keys are normalized to x-only lowercase hex before comparison, so
 * `0x`-prefixed, compressed, or mixed-case keys are handled correctly.
 *
 * @param vaultProviderPubkey - Vault provider BTC public key
 * @param vaultKeeperPubkeys - Vault keeper BTC public keys
 * @param depositorPubkey - Depositor (claimer) BTC public key
 * @returns Number of local challengers
 */
export function computeNumLocalChallengers(
  vaultProviderPubkey: string,
  vaultKeeperPubkeys: string[],
  depositorPubkey: string,
): number {
  const localSet = new Set<string>();
  localSet.add(normalizeKey(vaultProviderPubkey));
  for (const vk of vaultKeeperPubkeys) {
    localSet.add(normalizeKey(vk));
  }
  localSet.delete(normalizeKey(depositorPubkey));
  return localSet.size;
}

/** Roles a claimer can hold; determines which local-challenger rule applies. */
export interface DeriveLocalChallengersParams {
  /** The graph's claimer (VP, a vault keeper, or the depositor). */
  claimerBtcPubkey: string;
  /** Depositor registered on-chain for the vault. */
  depositorBtcPubkey: string;
  /** Vault provider registered on-chain for the vault. */
  vaultProviderBtcPubkey: string;
  /** Vault keepers registered on-chain for the vault. */
  vaultKeeperBtcPubkeys: string[];
}

/**
 * Derive the local-challenger set for a claimer's graph.
 *
 * Byte-for-byte mirror of btc-vault `derive_challengers_for`
 * (`crates/vault/src/tx_graph/graph.rs:257-284`):
 * - depositor-as-claimer → vault keepers only (VP excluded)
 * - VP- or VK-claimer → `({VP} ∪ VKs) − {claimer}`, sorted and deduplicated
 *
 * The protocol guarantees the depositor is not a vault keeper
 * (`TxGraphParams::validate`), so the depositor filter in the first branch is
 * defense-in-depth; it surfaces a clear error if a misconfigured context ever
 * violates the invariant.
 *
 * @throws If no local challenger remains, or (depositor path) the keeper set
 *   contains duplicates — both mean the signing context is misconfigured.
 */
export function deriveLocalChallengers(
  params: DeriveLocalChallengersParams,
): string[] {
  const claimer = normalizeKey(params.claimerBtcPubkey);
  const depositor = normalizeKey(params.depositorBtcPubkey);
  const vaultKeepers = params.vaultKeeperBtcPubkeys.map(normalizeKey);

  if (claimer === depositor) {
    const filtered = vaultKeepers.filter((k) => k !== depositor);
    if (filtered.length === 0) {
      throw new Error(
        "Cannot derive localChallengers: vault keeper set is empty (or contains only the depositor)",
      );
    }
    if (new Set(filtered).size !== filtered.length) {
      throw new Error(
        "Cannot derive localChallengers: duplicate vaultKeeper key — signing context is misconfigured",
      );
    }
    return filtered;
  }

  // Rust sorts then dedups before filtering; a Set keeps insertion order, so
  // sort after deduping for the same result.
  const deduped = [
    ...new Set([normalizeKey(params.vaultProviderBtcPubkey), ...vaultKeepers]),
  ].sort();
  const filtered = deduped.filter((k) => k !== claimer);
  if (filtered.length === 0) {
    throw new Error(
      `Cannot derive localChallengers: no vault provider or vault keeper remains after excluding claimer ${claimer}`,
    );
  }
  return filtered;
}
