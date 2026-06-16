/**
 * A `deriveContextHash` result is a 32-byte value, hex-encoded as 64
 * lowercase characters (`docs/specs/derive-context-hash.md` §2.1).
 */
export const CONTEXT_HASH_OUTPUT_HEX_LENGTH = 64;

const LOWERCASE_HEX = /^[0-9a-f]+$/;

/**
 * Validates a hex-encoded `deriveContextHash` output before it is consumed
 * as on-chain-binding vault material. Returns true only for a 64-char
 * lowercase-hex string.
 */
export const isValidContextHashOutput = (value: string): boolean =>
  value.length === CONTEXT_HASH_OUTPUT_HEX_LENGTH && LOWERCASE_HEX.test(value);
