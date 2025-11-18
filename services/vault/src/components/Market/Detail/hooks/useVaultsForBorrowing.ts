/**
 * Hook to fetch vaults available for use as collateral in Morpho borrowing
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { Address } from "viem";

import { CONTRACTS } from "../../../../config/contracts";
import { getAvailableCollaterals } from "../../../../services/vault/vaultQueryService";

export interface BorrowableVault {
  txHash: string;
  amountSatoshis: bigint;
}

interface UseVaultsForBorrowingResult {
  vaults: BorrowableVault[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useVaultsForBorrowing(
  address: Address | undefined,
): UseVaultsForBorrowingResult {
  const {
    data: vaultsData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["borrowableVaults", address],
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

  const vaults: BorrowableVault[] = useMemo(() => {
    if (!vaultsData) return [];
    return vaultsData.map((vault) => ({
      txHash: vault.txHash,
      amountSatoshis: vault.amountSatoshis,
    }));
  }, [vaultsData]);

  const wrappedRefetch = async () => {
    await refetch();
  };

  return {
    vaults,
    isLoading,
    error: error as Error | null,
    refetch: wrappedRefetch,
  };
}
