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
