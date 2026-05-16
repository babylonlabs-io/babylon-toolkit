/**
 * Hook for estimating gas cost of a deposit-related Ethereum transaction.
 *
 * Powers the Ethereum Network Fee row on the deposit form (where the actual
 * `submitPeginRequestBatch` calldata is not available until the user signs,
 * so a representative gas-units constant is used instead of a live
 * `estimateGas` call) and the borrow form.
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { ethClient } from "@/clients/eth-contract/client";
import { usePrice } from "@/hooks/usePrices";

const WEI_PER_ETH = 10n ** 18n;
const GAS_ESTIMATE_STALE_TIME_MS = 30_000;

/**
 * Representative gas units for the `submitPeginRequestBatch` ETH transaction
 * that finalizes a deposit. Used because the real calldata (signed pegin tx,
 * PoP signature, depositor wots pk hash) is not assembled until the user
 * has signed - so a live `estimateGas` is not possible at fee-display time.
 *
 * TODO(#1657): Replace with an observed value. Source: log emitted by
 * `PeginManager.registerPeginBatchOnChain` (see the `[gasEstimate]` console
 * line just before `sendTransaction`). Run a real deposit on devnet/testnet
 * and copy the printed value here.
 */
export const DEPOSIT_PEGIN_BATCH_GAS_UNITS = 500_000n;

/**
 * Representative gas units for the borrow ETH transaction. Calldata differs
 * from `submitPeginRequestBatch`, so the constant is kept separate even if
 * the numeric value turns out to be similar.
 *
 * TODO(#1657): Replace with an observed value from a real borrow on
 * devnet/testnet.
 */
export const BORROW_GAS_UNITS = 500_000n;

export interface DepositGasEstimate {
  /** Formatted ETH fee string (e.g. "0.000123 ETH"). */
  feeEth: string;
  /** Formatted USD string in parens (e.g. "($0.42 USD)"). */
  feeUsd: string;
  /** Whether the estimate is loading. */
  isLoading: boolean;
  /** Whether the estimate failed. */
  isError: boolean;
}

interface UseDepositGasEstimateParams {
  /** Representative gas-units constant for the target ETH transaction. */
  gasUnits: bigint;
  /** Whether estimation should run. */
  enabled: boolean;
}

/**
 * Multiplies a representative gas-units constant by the current gas price
 * and converts to formatted ETH + USD strings.
 */
export function useDepositGasEstimate({
  gasUnits,
  enabled,
}: UseDepositGasEstimateParams): DepositGasEstimate {
  const ethPrice = usePrice("ETH");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["depositGasEstimate", gasUnits.toString()],
    queryFn: async () => {
      const publicClient = ethClient.getPublicClient();
      const gasPrice = await publicClient.getGasPrice();

      const gasCostWei = gasUnits * gasPrice;
      // Split into whole + remainder to avoid BigInt-to-Number precision loss
      // (gasCostWei can exceed Number.MAX_SAFE_INTEGER at high gas prices).
      const wholePart = gasCostWei / WEI_PER_ETH;
      const remainder = gasCostWei % WEI_PER_ETH;
      return Number(wholePart) + Number(remainder) / Number(WEI_PER_ETH);
    },
    enabled,
    staleTime: GAS_ESTIMATE_STALE_TIME_MS,
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
