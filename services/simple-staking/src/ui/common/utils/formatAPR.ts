/**
 * Format APR as percentage string with 2 decimal places.
 *
 * @param apr - APR value (as decimal, e.g., 5.2 for 5.2%)
 * @returns Formatted string (e.g., "5.20")
 *
 * @example
 * formatAPRPercentage(5.2) // "5.20"
 * formatAPRPercentage(null) // "0.00"
 * formatAPRPercentage(0) // "0.00"
 */
export const formatAPRPercentage = (apr: number | null | undefined): string => {
  return apr ? apr.toFixed(2) : "0.00";
};

/**
 * Format APR with percentage symbol.
 *
 * @param apr - APR value
 * @returns Formatted string with % symbol (e.g., "5.20%")
 */
export const formatAPRWithSymbol = (apr: number | null | undefined): string => {
  return `${formatAPRPercentage(apr)}%`;
};
