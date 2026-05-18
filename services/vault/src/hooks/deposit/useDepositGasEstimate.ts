/**
 * Hook for estimating gas cost of the deposit submitPeginRequestBatch
 * Ethereum transaction. Powers the Ethereum Network Fee row on the deposit
 * form.
 *
 * The estimate is produced before the depositor has signed anything, so the
 * SDK helper {@link estimateSubmitPeginRequestBatchGas} synthesizes calldata
 * with representative dummy bytes for the per-vault signature/tx fields. The
 * resulting gas value is approximate but is a real on-chain estimate, not a
 * hardcoded constant.
 */

import { estimateSubmitPeginRequestBatchGas } from "@babylonlabs-io/ts-sdk/tbv/core";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { Address } from "viem";

import { ethClient } from "@/clients/eth-contract/client";
import { CONTRACTS } from "@/config/contracts";
import { useETHWallet } from "@/context/wallet";
import { usePrice } from "@/hooks/usePrices";

const WEI_PER_ETH = 10n ** 18n;
const GAS_ESTIMATE_STALE_TIME_MS = 30_000;

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
  /** Selected vault provider address; estimate is skipped when undefined. */
  vaultProvider: Address | undefined;
  /** Number of vaults in the batch (1 for single deposits). */
  batchSize: number;
  /** Whether estimation should run. */
  enabled: boolean;
}

function weiToEth(weiCost: bigint): number {
  const wholePart = weiCost / WEI_PER_ETH;
  const remainder = weiCost % WEI_PER_ETH;
  return Number(wholePart) + Number(remainder) / Number(WEI_PER_ETH);
}

export function useDepositGasEstimate({
  vaultProvider,
  batchSize,
  enabled,
}: UseDepositGasEstimateParams): DepositGasEstimate {
  const ethPrice = usePrice("ETH");
  const { address: depositorEthAddress } = useETHWallet();

  const canEstimate =
    enabled && !!vaultProvider && !!depositorEthAddress && batchSize > 0;

  const { data, isLoading, isError } = useQuery({
    queryKey: [
      "depositGasEstimate",
      vaultProvider ?? null,
      depositorEthAddress ?? null,
      batchSize,
    ],
    queryFn: async () => {
      if (!vaultProvider || !depositorEthAddress) {
        throw new Error("Missing inputs for deposit gas estimate");
      }
      const publicClient = ethClient.getPublicClient();
      const [gasUnits, gasPrice] = await Promise.all([
        estimateSubmitPeginRequestBatchGas({
          publicClient,
          btcVaultRegistry: CONTRACTS.BTC_VAULT_REGISTRY,
          depositorEthAddress: depositorEthAddress as Address,
          vaultProvider,
          batchSize,
        }),
        publicClient.getGasPrice(),
      ]);
      return weiToEth(gasUnits * gasPrice);
    },
    enabled: canEstimate,
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
