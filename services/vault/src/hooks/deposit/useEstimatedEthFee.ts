import { calculatePeginGasEstimate } from "@babylonlabs-io/ts-sdk/tbv/core";
import { formatEther } from "viem";
import { useGasPrice } from "wagmi";

/**
 * Hook to estimate ETH gas fee for the submitPeginRequest transaction.
 *
 * Uses the SDK's `calculatePeginGasEstimate` utility (pure function)
 * combined with wagmi's `useGasPrice` hook.
 *
 * @param unsignedTxHex - Unsigned BTC transaction hex, or null if not available
 * @returns Estimated ETH fee in ETH (as a number), or null if unavailable
 */
export function useEstimatedEthFee(
  unsignedTxHex: string | null,
): number | null {
  const { data: gasPrice } = useGasPrice();

  if (!unsignedTxHex || !gasPrice) return null;

  const gasEstimate = calculatePeginGasEstimate(unsignedTxHex);
  const feeInWei = gasEstimate * gasPrice;

  return parseFloat(formatEther(feeInWei));
}
