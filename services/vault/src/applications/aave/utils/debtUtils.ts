/**
 * Aave Debt Utilities
 *
 * Shared utility functions for debt calculations.
 */

import type { AaveSpokeUserPosition } from "../clients/spoke";

/**
 * Check if a position has any debt based on Spoke position data.
 *
 * A position is considered to have debt if any of:
 * - drawnShares > 0 (borrowed principal)
 * - premiumShares > 0 (accrued interest shares)
 * - realizedPremiumRay > 0 (realized interest)
 *
 * @param position - User position data from Spoke
 * @returns true if the position has any debt
 */
export function hasDebtFromPosition(position: AaveSpokeUserPosition): boolean {
  return (
    position.drawnShares > 0n ||
    position.premiumShares > 0n ||
    position.realizedPremiumRay > 0n
  );
}
