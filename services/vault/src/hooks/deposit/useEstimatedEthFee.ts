import { encodeSubmitPeginCalldataForGasEstimation } from "@babylonlabs-io/ts-sdk/tbv/core";
import { useMemo } from "react";
import { formatEther } from "viem";
import { useEstimateGas, useGasPrice } from "wagmi";

import { CONTRACTS } from "../../config/contracts";

/** Buffer percentage for ETH gas estimate (20% = 120/100) */
const ETH_GAS_ESTIMATE_BUFFER_PERCENT = 120n;

/**
 * Hook to estimate ETH gas fee for the submitPeginRequest transaction.
 *
 * ⚠️ FOR GAS ESTIMATION ONLY - uses dummy values for fixed-size fields internally.
 * The returned fee estimate is accurate, but the underlying calldata cannot be used
 * for actual transaction submission.
 *
 * Only requires the unsigned BTC transaction since it's the only variable-size field
 * that affects gas cost. All other fields (addresses, pubkeys, signature) are fixed-size.
 *
 * @param unsignedTxHex - Unsigned BTC transaction hex, or null if not available
 * @returns Estimated ETH fee in ETH (as a number), or null if unavailable
 */
export function useEstimatedEthFee(
  unsignedTxHex: string | null,
): number | null {
  const { data: gasPrice } = useGasPrice();

  // Encode the contract calldata using dummy values for fixed-size fields
  const callData = useMemo(() => {
    if (!unsignedTxHex) return null;

    try {
      return encodeSubmitPeginCalldataForGasEstimation(unsignedTxHex);
    } catch (err) {
      console.error("Failed to encode submitPeginRequest calldata:", err);
      return null;
    }
  }, [unsignedTxHex]);

  // Estimate gas using wagmi hook
  const { data: gasEstimate } = useEstimateGas({
    to: CONTRACTS.BTC_VAULTS_MANAGER,
    data: callData ?? undefined,
    query: {
      enabled: !!callData,
    },
  });

  const estimatedEthFee = useMemo(() => {
    if (!gasEstimate || !gasPrice) return null;

    const gasWithBuffer =
      (gasEstimate * ETH_GAS_ESTIMATE_BUFFER_PERCENT) / 100n;
    const feeInWei = gasWithBuffer * gasPrice;

    return parseFloat(formatEther(feeInWei));
  }, [gasEstimate, gasPrice]);

  return estimatedEthFee;
}
