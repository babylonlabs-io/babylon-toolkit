import { useMemo } from "react";

import { satoshiToBtcNumber } from "@/utils/btcConversion";

export interface BtcFeeDisplay {
  /** BTC fee as a number (for calculations), or null if unavailable */
  btcFee: number | null;
  /** USD equivalent of the fee, or null if price unavailable */
  btcFeeUsd: number | null;
  /** Formatted string for the fee amount column */
  feeAmount: string;
  /** Formatted string for the fee USD column */
  feePrice: string;
  /** Whether the display is in an error state */
  isError: boolean;
}

/**
 * Formats estimated BTC fee data into display-ready values.
 *
 * Follows the same computation pattern as useDepositReviewData in the old flow:
 * satoshiToBtcNumber for BTC conversion, simple multiplication for USD.
 */
export function useBtcFeeDisplay(params: {
  estimatedFeeSats: bigint | null;
  btcPrice: number;
  hasPriceFetchError: boolean;
  isLoadingFee: boolean;
  feeError: string | null;
  hasAmount: boolean;
}): BtcFeeDisplay {
  const {
    estimatedFeeSats,
    btcPrice,
    hasPriceFetchError,
    isLoadingFee,
    feeError,
    hasAmount,
  } = params;

  const { btcFee, btcFeeUsd } = useMemo(() => {
    if (estimatedFeeSats === null) return { btcFee: null, btcFeeUsd: null };
    const fee = satoshiToBtcNumber(estimatedFeeSats);
    const hasPrice = !hasPriceFetchError && btcPrice > 0;
    return { btcFee: fee, btcFeeUsd: hasPrice ? fee * btcPrice : null };
  }, [estimatedFeeSats, btcPrice, hasPriceFetchError]);

  return useMemo(() => {
    if (!hasAmount) {
      return {
        btcFee: null,
        btcFeeUsd: null,
        feeAmount: "-- BTC",
        feePrice: "",
        isError: false,
      };
    }
    if (isLoadingFee) {
      return {
        btcFee: null,
        btcFeeUsd: null,
        feeAmount: "Estimating...",
        feePrice: "",
        isError: false,
      };
    }
    if (feeError) {
      return {
        btcFee: null,
        btcFeeUsd: null,
        feeAmount: feeError,
        feePrice: "",
        isError: true,
      };
    }
    if (btcFee === null) {
      return {
        btcFee: null,
        btcFeeUsd: null,
        feeAmount: "-- BTC",
        feePrice: "",
        isError: false,
      };
    }

    const feePrice =
      btcFeeUsd !== null
        ? `($${btcFeeUsd.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })} USD)`
        : "";

    return {
      btcFee,
      btcFeeUsd,
      feeAmount: `${btcFee.toFixed(8)} BTC`,
      feePrice,
      isError: false,
    };
  }, [hasAmount, isLoadingFee, feeError, btcFee, btcFeeUsd]);
}
