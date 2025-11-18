/**
 * Hook to fetch available collaterals (vaults) for borrowing
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { Address } from "viem";

import { CONTRACTS } from "../../../../config/contracts";
import { getAvailableCollaterals } from "../../../../services/vault/vaultQueryService";

export interface AvailableVault {
  txHash: string;
  amountSatoshis: bigint;
}

interface UseAvailableCollateralsResult {
  availableVaults: AvailableVault[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useAvailableCollaterals(
  address: Address | undefined,
): UseAvailableCollateralsResult {
  const {
    data: availableCollaterals,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["availableCollaterals", address],
    queryFn: () =>
      getAvailableCollaterals(
        address as Address,
        CONTRACTS.BTC_VAULTS_MANAGER,
        CONTRACTS.MORPHO_CONTROLLER,
      ),
    enabled: !!address,
    retry: 2,
    staleTime: 30000,
  });

  const availableVaults: AvailableVault[] = useMemo(() => {
    if (!availableCollaterals) return [];
    return availableCollaterals.map((collateral) => ({
      txHash: collateral.txHash,
      amountSatoshis: collateral.amountSatoshis,
    }));
  }, [availableCollaterals]);

  const wrappedRefetch = async () => {
    await refetch();
  };

  return {
    availableVaults,
    isLoading,
    error: error as Error | null,
    refetch: wrappedRefetch,
  };
}
