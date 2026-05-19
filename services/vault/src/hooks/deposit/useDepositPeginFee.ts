/**
 * Reads the protocol pegin fee (in wei) from the BTCVaultRegistry contract
 * for the selected vault provider, scales it by the deposit's batch size,
 * and formats the total as ETH + USD for the deposit form's fee breakdown.
 *
 * Mirrors the same on-chain read that `PeginManager.preparePegin` performs
 * before submitting `submitPeginRequest` - surfaced here so the value is
 * shown before the user signs, not after. The on-chain
 * `submitPeginRequestBatch` charges `peginFee * batchSize`, so callers must
 * pass the batch size to display the total fee the user will actually pay.
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { Address } from "viem";

import { getPegInFeeFromChain } from "@/clients/eth-contract/btc-vault-registry/query";
import { usePrice } from "@/hooks/usePrices";

const WEI_PER_ETH = 10n ** 18n;
const STALE_TIME_MS = 30_000;

export interface DepositPeginFee {
  feeWei: bigint | null;
  feeEthFormatted: string;
  feeUsdFormatted: string;
  isLoading: boolean;
  isError: boolean;
}

export function useDepositPeginFee(
  vaultProvider: Address | undefined,
  batchSize: number = 1,
): DepositPeginFee {
  const ethPrice = usePrice("ETH");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["depositPeginFee", vaultProvider?.toLowerCase() ?? null],
    queryFn: () => {
      if (!vaultProvider) {
        throw new Error("vaultProvider is required for pegin fee query");
      }
      return getPegInFeeFromChain(vaultProvider);
    },
    enabled: !!vaultProvider,
    staleTime: STALE_TIME_MS,
    retry: 1,
  });

  return useMemo<DepositPeginFee>(() => {
    if (!vaultProvider) {
      return {
        feeWei: null,
        feeEthFormatted: "--",
        feeUsdFormatted: "",
        isLoading: false,
        isError: false,
      };
    }
    if (isLoading) {
      return {
        feeWei: null,
        feeEthFormatted: "--",
        feeUsdFormatted: "",
        isLoading: true,
        isError: false,
      };
    }
    if (isError || data == null) {
      return {
        feeWei: null,
        feeEthFormatted: "--",
        feeUsdFormatted: "",
        isLoading: false,
        isError: true,
      };
    }

    const totalFeeWei = data * BigInt(batchSize);

    // Split into whole + remainder to keep precision when feeWei exceeds
    // Number.MAX_SAFE_INTEGER (same pattern as useReorderGasEstimate).
    const wholePart = totalFeeWei / WEI_PER_ETH;
    const remainder = totalFeeWei % WEI_PER_ETH;
    const feeEth = Number(wholePart) + Number(remainder) / Number(WEI_PER_ETH);

    const feeUsdFormatted =
      ethPrice > 0
        ? `($${(feeEth * ethPrice).toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })} USD)`
        : "";

    return {
      feeWei: totalFeeWei,
      feeEthFormatted: `${feeEth.toFixed(6)} ETH`,
      feeUsdFormatted,
      isLoading: false,
      isError: false,
    };
  }, [vaultProvider, isLoading, isError, data, ethPrice, batchSize]);
}
