/**
 * Utility functions for address and hash formatting
 */

const TRUNCATE_PREFIX_LENGTH = 6;
const TRUNCATE_SUFFIX_LENGTH = 4;
const TRUNCATE_MIN_LENGTH = TRUNCATE_PREFIX_LENGTH + TRUNCATE_SUFFIX_LENGTH;

/**
 * Truncates an Ethereum address to show first 6 and last 4 characters
 * Example: 0x1234567890abcdef... -> 0x1234...cdef
 */
export function truncateAddress(address: string): string {
  if (!address || address.length < TRUNCATE_MIN_LENGTH) return address;
  return `${address.slice(0, TRUNCATE_PREFIX_LENGTH)}...${address.slice(-TRUNCATE_SUFFIX_LENGTH)}`;
}

/**
 * Truncates a transaction hash for display
 * Example: 0xa1b2c3d4e5f6... -> 0xa1b2...a1b2
 */
export function truncateHash(hash: string): string {
  if (!hash || hash.length < TRUNCATE_MIN_LENGTH) return hash;
  return `${hash.slice(0, TRUNCATE_PREFIX_LENGTH)}...${hash.slice(-TRUNCATE_SUFFIX_LENGTH)}`;
}
