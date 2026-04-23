/**
 * Withdraw selection normalization.
 *
 * Vault selections persist across polls (and across dialog lifetimes). A
 * vault that was in the list when the user picked it may be gone by the
 * time the selection is read again (redemption finished, position refreshed,
 * reorg, etc.). Letting a stale ID leak into projected-HF math or into the
 * withdraw transaction call is a correctness bug, so both the inline list
 * and the dialog filter selections to the current in-use set at every read
 * point.
 */

export interface EffectiveVaultSelection<V> {
  selectedVaultIds: string[];
  selectedVaults: V[];
}

export function getEffectiveVaultSelection<
  V extends { vaultId: string; inUse: boolean },
>(
  vaults: readonly V[],
  selectedVaultIds: readonly string[],
): EffectiveVaultSelection<V> {
  const inUseVaults = vaults.filter((v) => v.inUse);
  const inUseIds = new Set(inUseVaults.map((v) => v.vaultId));
  const ids = selectedVaultIds.filter((id) => inUseIds.has(id));
  const idSet = new Set(ids);
  const selectedVaults = inUseVaults.filter((v) => idSet.has(v.vaultId));
  return { selectedVaultIds: ids, selectedVaults };
}
