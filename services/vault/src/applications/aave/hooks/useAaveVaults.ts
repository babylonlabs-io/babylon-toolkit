/**
 * Hook to fetch user's vaults for the Aave overview page
 *
 * Fetches vaults from GraphQL and transforms them to the format
 * needed by the VaultsTable component.
 */

import type { Address } from "viem";

import { useBTCPrice } from "@/hooks/useBTCPrice";
import { useVaults } from "@/hooks/useVaults";
import { ContractStatus, getPeginState } from "@/models/peginStateMachine";
import type { Vault } from "@/types/vault";
import { satoshiToBtcNumber } from "@/utils/btcConversion";

import type { VaultData } from "../components/Overview/components/VaultsTable";

/**
 * Transform a Vault to VaultData for display in the table
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

/**
 * Hook to fetch and transform user's vaults for the Aave overview
 *
 * @param depositorAddress - User's Ethereum address
 * @returns Vaults data for the table, loading state, and error
 */
export function useAaveVaults(depositorAddress: Address | undefined) {
  const {
    data: vaults,
    isLoading: vaultsLoading,
    error,
  } = useVaults(depositorAddress);
  const { btcPriceUSD, loading: priceLoading } = useBTCPrice();

  const isLoading = vaultsLoading || priceLoading;

  // Filter to only active vaults (not redeemed) and transform for display
  const vaultTableData: VaultData[] =
    vaults && btcPriceUSD
      ? vaults
          .filter((vault) => vault.status === ContractStatus.ACTIVE)
          .map((vault) => transformVaultToTableData(vault, btcPriceUSD))
      : [];

  return {
    vaults: vaultTableData,
    isLoading,
    error,
  };
}
