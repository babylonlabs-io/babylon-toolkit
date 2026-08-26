/**
 * Hook for estimating gas cost of a vault reorder transaction.
 *
 * Builds the reorderVaults calldata from the current drag order,
 * estimates gas via eth_estimateGas, and converts to ETH + USD.
 */

import { buildReorderVaultsTx } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { Hex } from "viem";
import { useAccount } from "wagmi";

import { getAaveAdapterAddress } from "@/applications/aave/config";
import { ethClient } from "@/clients/eth-contract/client";
import { usePrice } from "@/hooks/usePrices";

const WEI_PER_ETH = 10n ** 18n;

export interface ReorderGasEstimate {
  /** Formatted ETH fee string (e.g. "0.00012 ETH") */
  feeEth: string;
  /** Formatted USD string (e.g. "($0.25 USD)") */
  feeUsd: string;
  /** Whether the estimate is loading */
  isLoading: boolean;
  /** Whether the estimate failed */
  isError: boolean;
}

/**
 * Estimates the gas cost for reordering vaults.
 *
 * @param vaultIds - Current ordered vault IDs (from drag state)
 * @param enabled - Whether estimation should run (e.g. only when modal is open)
 */
export function useReorderGasEstimate(
  vaultIds: Hex[],
  enabled: boolean,
): ReorderGasEstimate {
  const { address } = useAccount();
  const ethPrice = usePrice("ETH");

  // Stable query key from vault ID order
  const vaultIdKey = vaultIds.join(",");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["reorderGasEstimate", address, vaultIdKey],
    queryFn: async () => {
      const publicClient = ethClient.getPublicClient();
      const adapterAddress = getAaveAdapterAddress();
      const { to, data } = buildReorderVaultsTx(adapterAddress, vaultIds);

      const [gasUnits, gasPrice] = await Promise.all([
        publicClient.estimateGas({
          to,
          data,
          account: address,
        }),
        publicClient.getGasPrice(),
      ]);

      const gasCostWei = gasUnits * gasPrice;
      // Split into whole + remainder to avoid BigInt-to-Number precision loss
      // (gasCostWei can exceed Number.MAX_SAFE_INTEGER at high gas prices)
      const wholePart = gasCostWei / WEI_PER_ETH;
      const remainder = gasCostWei % WEI_PER_ETH;
      return Number(wholePart) + Number(remainder) / Number(WEI_PER_ETH);
    },
    enabled: enabled && !!address && vaultIds.length > 0,
    staleTime: 30_000,
    retry: 1,
  });

  return useMemo(() => {
    if (isLoading) {
      return {
        feeEth: "Estimating...",
        feeUsd: "",
        isLoading: true,
        isError: false,
      };
    }

    if (isError || data == null) {
      return {
        feeEth: "-- ETH",
        feeUsd: "",
        isLoading: false,
        isError: true,
      };
    }

    const feeUsd =
      ethPrice > 0
        ? `($${(data * ethPrice).toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })} USD)`
        : "";

    return {
      feeEth: `${data.toFixed(6)} ETH`,
      feeUsd,
      isLoading: false,
      isError: false,
    };
  }, [isLoading, isError, data, ethPrice]);
}
