/**
 * Fee-rate bounds for the pre-pegin funding tx's custom fee-rate input.
 *
 * Port of simple-staking's `getFeeRateFromMempool` (see
 * `services/simple-staking/src/ui/common/utils/getFeeRateFromMempool.ts` and
 * its `nextPowerOfTwo` helper) — reimplemented locally so the vault service
 * doesn't import across services.
 */

import { MIN_RELAY_FEE_RATE_SATS_VB } from "@/constants";

// simple-staking's `getFeeRateFromMempool` floors the fee-rate range's cap at
// 128 sat/vB so a slow mempool (small fastestFee) still leaves headroom for a
// user-entered custom rate above the current tiers.
const LEAST_MAX_FEE_RATE = 128;

function nextPowerOfTwo(x: number): number {
  if (x <= 0) return 2;
  if (x === 1) return 4;

  return Math.pow(2, Math.ceil(Math.log2(x)) + 1);
}

export interface FeeRateBounds {
  minFeeRate: number;
  defaultFeeRate: number;
  maxFeeRate: number;
}

/**
 * Computes the min/default/max sat/vB range for the custom fee-rate input.
 * The hard floor is the Bitcoin min relay fee (`MIN_RELAY_FEE_RATE_SATS_VB`);
 * `hourFeeRate` is only a soft warn threshold, surfaced separately by callers.
 */
export function getFeeRateBounds(fees: {
  defaultFeeRate: number;
  hourFeeRate: number;
}): FeeRateBounds {
  return {
    minFeeRate: MIN_RELAY_FEE_RATE_SATS_VB,
    defaultFeeRate: fees.defaultFeeRate,
    maxFeeRate: Math.max(
      LEAST_MAX_FEE_RATE,
      nextPowerOfTwo(fees.defaultFeeRate),
    ),
  };
}
