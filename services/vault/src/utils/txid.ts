/**
 * Remove a leading `0x`/`0X` prefix from a hex string.
 *
 * Local rather than the SDK's `stripHexPrefix` because that export lives behind
 * `@babylonlabs-io/ts-sdk/tbv/core`, a barrel that drags bitcoinjs-lib into any
 * chunk importing it. This module has no imports of its own, so ETH-only route
 * chunks can use it without pulling in the BTC stack.
 */
export function strip0x(value: string): string {
  return value.replace(/^0x/i, "");
}

/**
 * Canonical form used to key txid lookups across the polling layer and the
 * confirmed-pegin cache: hex without the `0x` prefix, lowercased.
 */
export function canonicalizeTxid(hex: string | undefined): string | undefined {
  return hex ? strip0x(hex).toLowerCase() : undefined;
}
