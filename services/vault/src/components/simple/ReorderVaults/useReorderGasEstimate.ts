/**
 * Hook for estimating gas cost of a vault reorder transaction.
 *
 * Builds the reorderVaults calldata from the current drag order,
 * estimates gas via eth_estimateGas, and converts to ETH + USD.
 */

import { formatCurrency } from "@babylonlabs-io/core-ui";
import { buildReorderVaultsTx } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { formatEther, type Address, type Hex } from "viem";

import { getAaveAdapterAddress } from "@/applications/aave/config";
import { ethClient } from "@/clients/eth-contract/client";
import { useETHWallet } from "@/context/wallet";
import { COPY } from "@/copy";
import { usePrice } from "@/hooks/usePrices";

/**
 * Decimals the ETH fee is shown with. A fee above 0 but below the smallest
 * shown unit reads "< 0.000001" instead of rounding to 0.
 */
const ETH_FEE_DISPLAY_DECIMALS = 6;

export interface ReorderGasEstimate {
  /** Formatted ETH fee string (e.g. "0.000120 ETH" or "< 0.000001 ETH") */
  feeEth: string;
  /** Formatted USD string (e.g. "($0.25 USD)" or "(< $0.01 USD)") */
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
  const address = useETHWallet().address as Address | undefined;
  const ethPrice = usePrice("ETH");

  // Stable query key from vault ID order
  const vaultIdKey = vaultIds.join(",");

  const {
    data: gasCostWei,
    isLoading,
    isError,
  } = useQuery({
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

      return gasUnits * gasPrice;
    },
    enabled: enabled && !!address && vaultIds.length > 0,
    staleTime: 30_000,
    retry: 1,
  });

  return useMemo(() => {
    if (isLoading) {
      return {
        feeEth: COPY.reorder.networkFeeEstimating,
        feeUsd: "",
        isLoading: true,
        isError: false,
      };
    }

    if (isError || gasCostWei == null) {
      return {
        feeEth: COPY.reorder.networkFeeUnavailable,
        feeUsd: "",
        isLoading: false,
        isError: true,
      };
    }

    // formatCurrency's default zero display is "-", which would read like
    // the unavailable placeholder; a zero fee reads as a plain zero.
    const feeInEth = Number(formatEther(gasCostWei));
    const feeUsd =
      ethPrice > 0
        ? COPY.reorder.networkFeeUsd(
            formatCurrency(feeInEth * ethPrice, { zeroDisplay: "$0" }),
          )
        : "";

    return {
      feeEth: COPY.reorder.networkFeeEth(
        formatCurrency(feeInEth, {
          prefix: "",
          zeroDisplay: "0",
          format: {
            minimumFractionDigits: ETH_FEE_DISPLAY_DECIMALS,
            maximumFractionDigits: ETH_FEE_DISPLAY_DECIMALS,
          },
        }),
      ),
      feeUsd,
      isLoading: false,
      isError: false,
    };
  }, [isLoading, isError, gasCostWei, ethPrice]);
}
