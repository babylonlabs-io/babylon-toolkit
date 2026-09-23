export function fmt(n: number, decimals = 2): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Suggested vault sizes carry 0.0001 BTC (10,000 sats) of precision. Cent
 * rounding is too coarse: at CF 86% it lifts the suggestion for positions up
 * to about 0.07 BTC past the position itself.
 */
export const SUGGESTED_VAULT_BTC_DECIMALS = 4;

/** Format a suggested vault size, dropping trailing zeros (0.1400 → "0.14"). */
export function fmtSuggestedVaultBtc(btc: number): string {
  return btc.toFixed(SUGGESTED_VAULT_BTC_DECIMALS).replace(/\.?0+$/, "");
}

export function fmtUsd(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}
