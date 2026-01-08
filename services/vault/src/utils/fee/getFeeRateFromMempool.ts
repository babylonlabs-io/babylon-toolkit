import type { NetworkFees } from "../../types/fee";

import { nextPowerOfTwo } from "./nextPowerOfTwo";

const LEAST_MAX_FEE_RATE = 128;

export interface FeeRates {
  minFeeRate: number;
  defaultFeeRate: number;
  maxFeeRate: number;
}

export const getFeeRateFromMempool = (
  mempoolFeeRates?: NetworkFees,
): FeeRates =>
  mempoolFeeRates
    ? {
        minFeeRate: mempoolFeeRates.hourFee,
        defaultFeeRate: mempoolFeeRates.fastestFee,
        maxFeeRate: Math.max(
          LEAST_MAX_FEE_RATE,
          nextPowerOfTwo(mempoolFeeRates.fastestFee),
        ),
      }
    : {
        minFeeRate: 0,
        defaultFeeRate: 0,
        maxFeeRate: 0,
      };
