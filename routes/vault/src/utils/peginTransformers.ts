/**
 * Data transformation utilities for converting blockchain data to UI formats
 */

/**
 * Satoshis per Bitcoin constant
 * 1 BTC = 100,000,000 satoshis
 */
export const SATOSHIS_PER_BTC = 100_000_000n;

/**
 * Format BTC amount from satoshis to BTC with proper decimals
 * @param satoshis - Amount in satoshis (smallest Bitcoin unit)
 * @returns Formatted BTC amount as string (e.g., "1.50")
 */
export function formatBTCAmount(satoshis: bigint): string {
  // Convert to BTC by dividing by 100,000,000
  const btc = Number(satoshis) / Number(SATOSHIS_PER_BTC);
  
  // Format with up to 8 decimal places, removing trailing zeros
  return btc.toFixed(8).replace(/\.?0+$/, '') || '0';
}

