import { selectUtxosForPegin } from "@babylonlabs-io/ts-sdk/tbv/core";
import { useMemo } from "react";

import type { MempoolUTXO } from "@/hooks/useUTXOs";

import { satoshiToBtcNumber } from "../../utils/btcConversion";
import { getFeeRateFromMempool } from "../../utils/fee/getFeeRateFromMempool";
import { estimatePeginFee } from "../../utils/fee/peginFee";
import { useNetworkFees } from "../useNetworkFees";

interface EstimatedBtcFeeResult {
  fee: number | null;
  feeRate: number;
}

/**
 * Hook to calculate estimated BTC transaction fee using iterative UTXO selection.
 *
 * When UTXOs are provided, uses the SDK's selectUtxosForPegin for accurate
 * fee calculation that accounts for the number of inputs needed.
 *
 * When UTXOs are not provided, falls back to a rough estimation based on
 * a single input assumption.
 *
 * @param amount - Amount to peg in (in satoshis)
 * @param utxos - Optional UTXOs for accurate fee calculation
 * @param enabled - Whether to fetch network fees (default: true)
 * @returns Object with estimated BTC fee in BTC and the fee rate used
 */
export function useEstimatedBtcFee(
  amount: bigint,
  utxos?: MempoolUTXO[],
  enabled = true,
): EstimatedBtcFeeResult {
  const { data: networkFees } = useNetworkFees({ enabled });
  const { defaultFeeRate } = getFeeRateFromMempool(networkFees);

  const estimatedBtcFee = useMemo(() => {
    if (!networkFees || defaultFeeRate === 0) return null;

    try {
      if (utxos && utxos.length > 0) {
        const sdkUtxos = utxos.map((utxo) => ({
          txid: utxo.txid,
          vout: utxo.vout,
          value: utxo.value,
          scriptPubKey: utxo.scriptPubKey ?? "",
        }));

        const result = selectUtxosForPegin(sdkUtxos, amount, defaultFeeRate);
        return satoshiToBtcNumber(result.fee);
      }

      const roughUtxo = { value: amount + 100000n };
      const feeInSats = estimatePeginFee(amount, [roughUtxo], defaultFeeRate);
      return satoshiToBtcNumber(feeInSats);
    } catch (error) {
      console.error("Failed to estimate BTC fee:", error);
      return null;
    }
  }, [networkFees, defaultFeeRate, amount, utxos]);

  return { fee: estimatedBtcFee, feeRate: defaultFeeRate };
}
