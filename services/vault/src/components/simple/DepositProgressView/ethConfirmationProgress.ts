/**
 * Pure helper for the "Ethereum confirmations" detail panel's estimate.
 *
 * The deposit holds between the Ethereum registration receipt and the
 * Pre-PegIn Bitcoin broadcast until the registration is
 * `PEGIN_ETH_CONFIRMATIONS` blocks deep. Unlike Bitcoin's ~10-minute target,
 * Ethereum's 12-second slot cadence makes seconds the readable unit here.
 */

import { ETH_SLOT_SECONDS } from "@/utils/activationDeadline";

/**
 * Estimated seconds until the registration reaches `required` confirmations.
 * Returns `null` once the depth is met — there is no remaining wait to
 * estimate and the flow is about to move on.
 *
 * Missed slots only stretch real intervals beyond 12s, so this is a lower
 * bound. That is the right direction for a progress hint: better to under-
 * promise than to show a countdown that stalls.
 */
export function computeRemainingEthEstimateSeconds(
  confirmations: number,
  required: number,
): number | null {
  if (confirmations >= required) return null;
  return (required - confirmations) * ETH_SLOT_SECONDS;
}
