import type { MempoolUTXO } from "@babylonlabs-io/ts-sdk";
import { selectUtxosForPegin } from "@babylonlabs-io/ts-sdk/tbv/core";
import { useMemo } from "react";

import { useNetworkFees } from "../useNetworkFees";

export interface EstimatedBtcFeeResult {
  /** Estimated fee in satoshis, or null if unavailable */
  fee: bigint | null;
  /** Fee rate used for calculation (sat/vB) */
  feeRate: number;
  /** Whether fee rates are still loading */
  isLoading: boolean;
  /** Error if fee could not be calculated */
  error: string | null;
}

/**
 * Hook to calculate estimated BTC transaction fee using iterative UTXO selection.
 *
 * When UTXOs are provided, uses the SDK's selectUtxosForPegin for accurate
 * fee calculation that accounts for the actual number of inputs needed.
 *
 * The algorithm iteratively:
 * 1. Adds UTXOs (sorted by value, largest first)
 * 2. Recalculates fee based on current inputs
 * 3. Checks if change output needed (affects fee)
 * 4. Continues until accumulated >= amount + fee
 *
 * @param amount - Amount to peg in (in satoshis)
 * @param utxos - Available UTXOs for fee calculation
 * @returns Estimated fee, fee rate, loading state, and error
 */
export function useEstimatedBtcFee(
  amount: bigint,
  utxos?: MempoolUTXO[],
): EstimatedBtcFeeResult {
  const { defaultFeeRate, isLoading, error: feeError } = useNetworkFees();

  const result = useMemo((): EstimatedBtcFeeResult => {
    // Still loading fee rates
    if (isLoading) {
      return {
        fee: null,
        feeRate: 0,
        isLoading: true,
        error: null,
      };
    }

    // Fee rate not available
    if (defaultFeeRate === 0) {
      return {
        fee: null,
        feeRate: 0,
        isLoading: false,
        error: feeError?.message ?? "Unable to fetch network fee rates",
      };
    }

    // No UTXOs provided - can't calculate accurate fee
    if (!utxos || utxos.length === 0) {
      return {
        fee: null,
        feeRate: defaultFeeRate,
        isLoading: false,
        error: null,
      };
    }

    // Amount is zero - no fee calculation needed
    if (amount === 0n) {
      return {
        fee: null,
        feeRate: defaultFeeRate,
        isLoading: false,
        error: null,
      };
    }

    try {
      // Use SDK's iterative UTXO selection with fee calculation
      const { fee } = selectUtxosForPegin(utxos, amount, defaultFeeRate);

      return {
        fee,
        feeRate: defaultFeeRate,
        isLoading: false,
        error: null,
      };
    } catch (err) {
      // Handle insufficient funds or other errors
      const errorMessage =
        err instanceof Error ? err.message : "Failed to estimate fee";

      return {
        fee: null,
        feeRate: defaultFeeRate,
        isLoading: false,
        error: errorMessage,
      };
    }
  }, [amount, utxos, defaultFeeRate, isLoading, feeError]);

  return result;
}
