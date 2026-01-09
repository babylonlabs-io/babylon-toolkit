import { LOCAL_PEGIN_CONFIG } from "../../config/pegin";
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
        minFeeRate: LOCAL_PEGIN_CONFIG.defaultFeeRate,
        defaultFeeRate: LOCAL_PEGIN_CONFIG.defaultFeeRate,
        maxFeeRate: LEAST_MAX_FEE_RATE,
      };
