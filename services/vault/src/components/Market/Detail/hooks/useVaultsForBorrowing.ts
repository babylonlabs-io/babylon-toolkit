/**
 * Hook to fetch vaults available for use as collateral in Morpho borrowing
 */

import { useMemo } from "react";
import type { Address } from "viem";

import { useVaults } from "../../../../hooks/useVaults";
import { ContractStatus } from "../../../../models/peginStateMachine";

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
  const { data, isLoading, error, refetch } = useVaults(address);

  // Filter for available vaults (active status and not in use)
  const vaults: BorrowableVault[] = useMemo(() => {
    if (!data) return [];

    return data
      .filter(
        (vaultWithStatus) =>
          vaultWithStatus.vault.status === ContractStatus.ACTIVE &&
          !vaultWithStatus.isInUse,
      )
      .map((vaultWithStatus) => ({
        txHash: vaultWithStatus.txHash,
        amountSatoshis: vaultWithStatus.vault.amount,
      }));
  }, [data]);

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
