/** Matches any 0x-prefixed hex string (at least one hex digit). */
export const VALID_HEX_PATTERN = /^0x[0-9a-fA-F]+$/;

/** Matches a 20-byte Ethereum address (0x + 40 hex chars). */
export const ETH_ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

/**
 * Matches a 0x-prefixed BTC public key in any standard encoding:
 * - x-only:       32 bytes → 64 hex chars
 * - compressed:   33 bytes → 66 hex chars
 * - uncompressed: 65 bytes → 130 hex chars
 */
export const BTC_PUBKEY_HEX_PATTERN =
  /^0x(?:[0-9a-fA-F]{64}|[0-9a-fA-F]{66}|[0-9a-fA-F]{130})$/;
