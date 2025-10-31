/**
 * Utility functions for calculating subset sums
 * Used to determine all possible combinations of vault amounts for collateral selection
 *
 *
 * @param amountsSatoshis - Array of bigint amounts in satoshis
 * @returns Sorted array of all possible sums in satoshis (excluding 0)
 */
export function calculateSubsetSums(amountsSatoshis: bigint[]): bigint[] {
  // Edge case: empty array
  if (amountsSatoshis.length === 0) {
    return [];
  }

  // Use a Set to track all possible sums (automatically handles duplicates)
  const possibleSums = new Set<bigint>();

  // Start with 0 as the base case
  possibleSums.add(0n);

  // For each amount, add it to all existing sums to create new possible sums
  for (const amount of amountsSatoshis) {
    // Create a copy of current sums to iterate over
    // (we can't modify the Set while iterating over it)
    const currentSums = Array.from(possibleSums);

    // Add the current amount to each existing sum
    for (const sum of currentSums) {
      possibleSums.add(sum + amount);
    }
  }

  // Convert Set to Array, remove 0, and sort
  return Array.from(possibleSums)
    .filter((sum) => sum > 0n) // Exclude 0 (no collateral selected)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)); // Sort in ascending order
}

/**
 * Convert an array of satoshi amounts to slider steps format (in BTC)
 *
 * @param amountsSatoshis - Array of possible sum amounts in satoshis
 * @returns Array of slider step objects with values in BTC
 */
export function amountsToSliderSteps(
  amountsSatoshis: bigint[],
): Array<{ value: number }> {
  return amountsSatoshis.map((amountSatoshis) => ({
    value: Number(amountSatoshis) / 1e8, // Convert satoshis to BTC for display
  }));
}

/**
 * Find vaults (by index) that sum to the target amount in satoshis
 * Uses a greedy algorithm to select vaults
 *
 * @param vaultAmounts - Array of vault amounts in satoshis
 * @param targetSatoshis - Target amount in satoshis
 * @returns Array of vault indices that sum to the target amount, or null if not possible
 */
export function findVaultIndicesForAmount(
  vaultAmounts: bigint[],
  targetSatoshis: bigint,
): number[] | null {
  if (targetSatoshis === 0n) {
    return []; // No vaults needed for 0 collateral
  }

  // Create array of [index, amount] pairs
  const vaults = vaultAmounts.map((amount, index) => ({ index, amount }));

  // Sort by amount descending (greedy approach: use larger vaults first)
  vaults.sort((a, b) =>
    a.amount > b.amount ? -1 : a.amount < b.amount ? 1 : 0,
  );

  const selected: number[] = [];
  let remaining = targetSatoshis;

  for (const vault of vaults) {
    if (remaining === 0n) break;

    if (vault.amount <= remaining) {
      selected.push(vault.index);
      remaining -= vault.amount;
    }
  }

  // Check if we found an exact match
  if (remaining === 0n) {
    return selected.sort((a, b) => a - b); // Return indices in original order
  }

  return null; // No exact combination found
}
