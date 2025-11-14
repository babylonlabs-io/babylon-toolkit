import { useMemo } from "react";

import { satoshiToBtcNumber } from "../../utils/btcConversion";
import { estimatePeginFee } from "../../utils/fee/peginFee";
import { useNetworkFees } from "../api/useNetworkFees";

/**
 * Hook to calculate estimated BTC transaction fee
 *
 * Uses current network fees from mempool API and estimates the fee
 * based on the peg-in amount and a rough UTXO estimate.
 *
 * @param amount - Amount to peg in (in satoshis)
 * @param enabled - Whether to fetch network fees (default: true)
 * @returns Estimated BTC fee in BTC (as a number), or null if unavailable
 */
export function useEstimatedBtcFee(
  amount: bigint,
  enabled = true,
): number | null {
  const { data: networkFees } = useNetworkFees({ enabled });

  const estimatedBtcFee = useMemo(() => {
    if (!networkFees) return null;

    // Use a rough UTXO estimate for fee calculation
    // Assume we need 1 UTXO that covers amount + fee
    const roughUtxo = { value: amount + 100000n }; // Add buffer for fee

    try {
      // Use halfHourFee for reasonable confirmation time
      const feeInSats = estimatePeginFee(
        amount,
        [roughUtxo],
        networkFees.halfHourFee,
      );

      return satoshiToBtcNumber(feeInSats);
    } catch (error) {
      console.error("Failed to estimate BTC fee:", error);
      return null;
    }
  }, [networkFees, amount]);

  return estimatedBtcFee;
}
