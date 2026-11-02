/**
 * What a borrower pays on a loan, built up from the Hub's drawn rate.
 *
 * Two charges sit on top of that rate, and each is a share of the same drawn
 * interest, so they add rather than compound:
 * - The Spoke's risk premium: premium shares grow on the same drawn index as
 *   drawn shares.
 * - The adapter's interest fee: charged on drawn interest only, not on premium
 *   interest.
 *
 * Display only. Any missing input gives no figure, because the drawn rate alone
 * would understate the cost.
 */

import { BPS_SCALE } from "../constants";

export function allInBorrowAprPercent({
  baseAprPercent,
  premiumFraction,
  interestFeeBps,
}: {
  /** Hub drawn rate as a percentage (e.g. 3.7 for 3.7%). */
  baseAprPercent: number | null | undefined;
  /** Risk premium as a fraction of drawn interest (e.g. 0.1 for 10%). */
  premiumFraction: number | null;
  /** Adapter interest fee in basis points. */
  interestFeeBps: number | null;
}): number | null {
  if (
    baseAprPercent == null ||
    premiumFraction == null ||
    interestFeeBps == null
  ) {
    return null;
  }
  return baseAprPercent * (1 + premiumFraction + interestFeeBps / BPS_SCALE);
}

/**
 * The risk premium a debt position is being charged, from its own shares.
 *
 * Not `getUserAccountData().riskPremium`: that recomputes what a refresh would
 * set now, while the position keeps paying the premium stored at its last
 * refresh until then. Null without drawn shares, where there is no drawn
 * interest for the premium to be a share of.
 */
export function premiumFractionFromShares({
  drawnShares,
  premiumShares,
}: {
  drawnShares: bigint;
  premiumShares: bigint;
}): number | null {
  if (drawnShares === 0n) {
    return null;
  }
  return Number(premiumShares) / Number(drawnShares);
}
