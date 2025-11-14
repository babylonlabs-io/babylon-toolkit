import { useMemo } from "react";
import { formatEther } from "viem";
import { useGasPrice } from "wagmi";

/**
 * Hook to calculate estimated ETH fee for transactions
 *
 * Note: Currently returns null as gas estimation is disabled.
 * Gas estimation was causing errors with empty calldata.
 * When submitting the actual transaction, gas will be estimated properly by the wallet.
 *
 * @returns Estimated ETH fee in ETH (as a number), or null if unavailable
 */
export function useEstimatedEthFee(): number | null {
  const { data: gasPrice } = useGasPrice();

  const estimatedEthFee = useMemo(() => {
    // Gas estimation is currently disabled
    // TODO: Enable proper gas estimation when transaction calldata is available
    const gasEstimate = undefined;

    if (!gasEstimate || !gasPrice) return null;

    // Add 20% buffer to gas estimate for safety
    const gasWithBuffer = (gasEstimate * 120n) / 100n;
    const feeInWei = gasWithBuffer * gasPrice;

    return parseFloat(formatEther(feeInWei));
  }, [gasPrice]);

  return estimatedEthFee;
}
