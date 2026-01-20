/**
 * Vault Selection Utilities for Aave
 *
 * Provides functions for selecting vaults to match a target collateral amount.
 * Uses a greedy algorithm that prioritizes larger vaults first.
 */

export interface SelectableVault {
  id: string;
  amount: number;
}

export interface VaultSelectionResult {
  /** IDs of selected vaults */
  vaultIds: string[];
  /** Actual total amount from selected vaults */
  actualAmount: number;
}

/**
 * Select vaults to match the target amount using a greedy algorithm.
 * Sorts vaults by amount descending and picks until target is met.
 *
 * @param vaults - Available vaults to select from
 * @param targetAmount - Target amount to reach
 * @returns Selected vault IDs and actual amount
 */
export function selectVaultsForAmount(
  vaults: SelectableVault[],
  targetAmount: number,
): VaultSelectionResult {
  if (targetAmount <= 0) {
    return { vaultIds: [], actualAmount: 0 };
  }

  const sortedVaults = [...vaults].sort((a, b) => b.amount - a.amount);

  const selectedIds: string[] = [];
  let selectedAmount = 0;

  for (const vault of sortedVaults) {
    if (selectedAmount >= targetAmount) break;
    selectedIds.push(vault.id);
    selectedAmount += vault.amount;
  }

  return { vaultIds: selectedIds, actualAmount: selectedAmount };
}

/**
 * Calculate total amount from a list of vaults
 *
 * @param vaults - Vaults to sum
 * @returns Total amount in BTC
 */
export function calculateTotalVaultAmount(vaults: SelectableVault[]): number {
  return vaults.reduce((sum, vault) => sum + vault.amount, 0);
}
