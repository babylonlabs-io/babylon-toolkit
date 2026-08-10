/**
 * Canonical form used to key txid lookups across the polling layer and the
 * confirmed-pegin cache: hex without the `0x` prefix, lowercased.
 */
export function canonicalizeTxid(hex: string | undefined): string | undefined {
  return hex ? hex.replace(/^0x/i, "").toLowerCase() : undefined;
}
