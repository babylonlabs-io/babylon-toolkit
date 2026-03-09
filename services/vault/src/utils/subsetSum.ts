/**
 * Utility functions for calculating subset sums
 * Used to determine all possible combinations of vault amounts for collateral selection
 */

/** Satoshis per BTC for conversion */
export const SATOSHIS_PER_BTC = 1e8;

/**
 * Convert BTC amount to satoshis
 *
 * @param btcAmount - Amount in BTC
 * @returns Amount in satoshis as bigint
 */
export function btcToSatoshis(btcAmount: number): bigint {
  return BigInt(Math.round(btcAmount * SATOSHIS_PER_BTC));
}

/**
 * Convert satoshis to BTC
 *
 * @param satoshis - Amount in satoshis
 * @returns Amount in BTC
 */
export function satoshisToBtc(satoshis: bigint): number {
  return Number(satoshis) / SATOSHIS_PER_BTC;
}

/**
 * Calculate all possible subset sums from an array of amounts
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
 * Find vault indices that sum exactly to the target amount in satoshis.
 *
 * Uses recursive backtracking: at each step we try including the current vault
 * (if it fits in the remaining amount) and recurse, then backtrack and try
 * skipping it. The first valid combination found is returned. This guarantees
 * we find a solution whenever one exists.
 *
 * @param vaultAmounts - Array of vault amounts in satoshis (order preserved for indices)
 * @param targetSatoshis - Target amount in satoshis
 * @returns Indices of vaults that sum to the target, or null if no such combination exists
 */
export function findVaultIndicesForAmount(
  vaultAmounts: bigint[],
  targetSatoshis: bigint,
): number[] | null {
  if (targetSatoshis === 0n) {
    return [];
  }

  function backtrack(
    startIndex: number,
    remaining: bigint,
    selected: number[],
  ): number[] | null {
    if (remaining === 0n) {
      return [...selected];
    }

    for (let i = startIndex; i < vaultAmounts.length; i++) {
      const amount = vaultAmounts[i];
      if (amount > remaining) continue;

      selected.push(i);
      const result = backtrack(i + 1, remaining - amount, selected);
      if (result !== null) return result;
      selected.pop();
    }

    return null;
  }

  return backtrack(0, targetSatoshis, []);
}
