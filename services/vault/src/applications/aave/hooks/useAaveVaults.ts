/**
 * Hook to fetch user's vaults for the Aave application
 *
 * Fetches vaults from GraphQL and transforms them to the format
 * needed by UI components. Returns both all active vaults and
 * vaults available for collateral (not currently in use or pending).
 */

import { useMemo } from "react";

import { useBTCPrice } from "@/hooks/useBTCPrice";
import { useVaults } from "@/hooks/useVaults";
import {
  ContractStatus,
  getPeginState,
  PEGIN_DISPLAY_LABELS,
} from "@/models/peginStateMachine";
import type { Vault } from "@/types/vault";
import { toAddress } from "@/utils/addressUtils";
import { satoshiToBtcNumber } from "@/utils/btcConversion";

import type { VaultData } from "../components/Overview/components/VaultsTable";
import { usePendingVaults } from "../context";

/**
 * Transform a Vault to VaultData for display
 */
function transformVaultToTableData(
  vault: Vault,
  btcPriceUsd: number,
): VaultData {
  const btcAmount = satoshiToBtcNumber(vault.amount);
  const usdValue = btcAmount * btcPriceUsd;

  const peginState = getPeginState(vault.status, { isInUse: vault.isInUse });

  return {
    id: vault.id,
    amount: btcAmount,
    usdValue,
    provider: {
      // Use truncated address as name, icon is undefined to use Avatar fallback
      name: `${vault.vaultProvider.slice(0, 6)}...${vault.vaultProvider.slice(-4)}`,
    },
    status: peginState.displayLabel,
  };
}

export interface UseAaveVaultsResult {
  /** All active vaults (for display in table) */
  vaults: VaultData[];
  /** Vaults available for use as collateral (not currently in use) */
  availableForCollateral: VaultData[];
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
}

/**
 * Hook to fetch and transform user's vaults for the Aave application
 *
 * @param depositorAddress - User's Ethereum address
 * @returns Vaults data including all active vaults and those available for collateral
 */
export function useAaveVaults(
  depositorAddress: string | undefined,
): UseAaveVaultsResult {
  const {
    data: vaults,
    isLoading: vaultsLoading,
    error,
  } = useVaults(depositorAddress ? toAddress(depositorAddress) : undefined);
  const { btcPriceUSD } = useBTCPrice();
  const { pendingVaultIds } = usePendingVaults();

  const isLoading = vaultsLoading;

  // Transform all active vaults for display
  // USD value will be 0 if price is not available, which is acceptable
  const allVaults = useMemo(() => {
    if (!vaults) return [];
    return vaults
      .filter((vault) => vault.status === ContractStatus.ACTIVE)
      .map((vault) => transformVaultToTableData(vault, btcPriceUSD));
  }, [vaults, btcPriceUSD]);

  // Filter to vaults available for collateral:
  // - Not currently in use by an application (from indexer)
  // - Not pending (submitted but not yet indexed)
  const availableForCollateral = useMemo(() => {
    return allVaults.filter(
      (vault) =>
        vault.status !== PEGIN_DISPLAY_LABELS.IN_USE &&
        !pendingVaultIds.has(vault.id),
    );
  }, [allVaults, pendingVaultIds]);

  return {
    vaults: allVaults,
    availableForCollateral,
    isLoading,
    error: error as Error | null,
  };
}
