/**
 * Challenger counting utilities.
 *
 * Used for UI-level validation (e.g. computing minimum deposit amounts)
 * where the depositor's identity is known. The transaction builders use
 * `vaultKeeperBtcPubkeys.length` to match the VP's current validation.
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
