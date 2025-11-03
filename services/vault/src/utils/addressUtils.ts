/**
 * Utility functions for address formatting and manipulation
 */

/**
 * Truncates an Ethereum address to show first 6 and last 4 characters
 * Example: 0x1234567890abcdef... -> 0x1234...cdef
 */
export function truncateAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
