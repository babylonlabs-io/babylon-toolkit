/**
 * Hook to fetch user's vaults for the Aave application
 *
 * Fetches vaults from GraphQL and transforms them to the format
 * needed by UI components. Returns both all active vaults and
 * vaults available for collateral (not currently in use or pending).
 */

import { useMemo } from "react";
import type { Address } from "viem";

import { useVaultProviders } from "@/hooks/deposit/useVaultProviders";
import { usePrice } from "@/hooks/usePrices";
import { useVaults } from "@/hooks/useVaults";
import {
  ContractStatus,
  getPeginState,
  PEGIN_DISPLAY_LABELS,
} from "@/models/peginStateMachine";
import type { Vault, VaultProvider } from "@/types";
import { truncateAddress } from "@/utils/addressUtils";
import { satoshiToBtcNumber } from "@/utils/btcConversion";

import type { VaultData } from "../components/Overview/components/VaultsTable";
import { usePendingVaults } from "../context";
import { useAaveConfig } from "../context/AaveConfigContext";

/**
 * Transform a Vault to VaultData for display
 */
function transformVaultToTableData(
  vault: Vault,
  btcPriceUsd: number,
  provider: VaultProvider | undefined,
): VaultData {
  const btcAmount = satoshiToBtcNumber(vault.amount);
  const usdValue = btcAmount * btcPriceUsd;

  const peginState = getPeginState(vault.status, { isInUse: vault.isInUse });

  // Use provider name if available, otherwise truncate the address
  const providerName = provider?.name ?? truncateAddress(vault.vaultProvider);

  return {
    id: vault.id,
    amount: btcAmount,
    usdValue,
    provider: {
      name: providerName,
      icon: provider?.iconUrl,
    },
    status: peginState.displayLabel,
  };
}

export interface UseAaveVaultsResult {
  /** All active vaults (for display in table) */
  vaults: VaultData[];
  /** Raw vault data (for operations like redeem that need applicationController) */
  rawVaults: Vault[];
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
  const { pendingVaults } = usePendingVaults();
  const hasPendingOperations = pendingVaults.size > 0;
  const { config } = useAaveConfig();
  const { findProvider } = useVaultProviders(config?.controllerAddress);

  const {
    data: vaults,
    isLoading: vaultsLoading,
    error,
  } = useVaults(depositorAddress as Address | undefined, {
    // Poll when there are pending operations to detect when indexer confirms them
    poll: hasPendingOperations,
  });
  const btcPriceUSD = usePrice("BTC");

  const isLoading = vaultsLoading;

  // Filter to active vaults only
  const activeVaults = useMemo(() => {
    if (!vaults) return [];
    return vaults.filter((vault) => vault.status === ContractStatus.ACTIVE);
  }, [vaults]);

  const allVaults = useMemo(() => {
    return activeVaults.map((vault) => {
      const provider = findProvider(vault.vaultProvider);
      const vaultData = transformVaultToTableData(vault, btcPriceUSD, provider);
      const pendingOperation = pendingVaults.get(vault.id);
      if (pendingOperation === "redeem") {
        return {
          ...vaultData,
          status: PEGIN_DISPLAY_LABELS.REDEEM_IN_PROGRESS,
        };
      }
      return vaultData;
    });
  }, [activeVaults, btcPriceUSD, findProvider, pendingVaults]);

  // Filter to vaults available for collateral:
  // - Not currently in use by an application (from indexer)
  // - Not pending (submitted but not yet indexed)
  const availableForCollateral = useMemo(() => {
    return allVaults.filter(
      (vault) =>
        vault.status !== PEGIN_DISPLAY_LABELS.IN_USE &&
        !pendingVaults.has(vault.id),
    );
  }, [allVaults, pendingVaults]);

  return {
    vaults: allVaults,
    rawVaults: activeVaults,
    availableForCollateral,
    isLoading,
    error: error as Error | null,
  };
}
