const BABY_IN_UBBN = 1e6;
/**
 * Converts BABY to uBBN (micro BABY).
 * should be used internally in the app
 * @param bbn The amount in BABY.
 * @returns The equivalent amount in uBBN.
 */
export function babyToUbbn(bbn: number): bigint {
  return BigInt(bbn * BABY_IN_UBBN);
}

/**
 * Converts uBBN (micro BABY) to BABY.
 * should be used only in the UI
 * @param ubbn The amount in uBBN.
 * @returns The equivalent amount in BABY.
 */
export function ubbnToBaby(ubbn: bigint): number {
  return Number(ubbn) / BABY_IN_UBBN;
}
