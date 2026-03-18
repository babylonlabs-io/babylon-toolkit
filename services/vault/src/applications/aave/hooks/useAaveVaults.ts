/**
 * Hook to fetch user's vaults for the Aave application
 *
 * Fetches vaults from GraphQL and transforms them to the format
 * needed by UI components. Returns both all active vaults and
 * vaults available for collateral (not currently in use or pending).
 */

import { useEffect, useMemo, useState } from "react";
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
import { satoshiToBtcNumber } from "@/utils/btcConversion";
import { formatProviderDisplayName } from "@/utils/formatting";

import { usePendingVaults } from "../context";
import type { VaultData } from "../types";

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

  const providerName = formatProviderDisplayName(
    provider?.name,
    vault.vaultProvider,
  );

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

export interface RedeemedVaultInfo {
  id: string;
  amountBtc: number;
  providerName: string;
  providerIconUrl?: string;
  /** Vault provider's Ethereum address (used to look up RPC URL for pegout polling) */
  vaultProviderAddress: string;
  /** Timestamp in milliseconds when vault was created */
  createdAt: number;
}

export interface UseAaveVaultsResult {
  /** All active vaults (for display in table) */
  vaults: VaultData[];
  /** Vaults available for use as collateral (not currently in use) */
  availableForCollateral: VaultData[];
  /** Vaults with "redeemed" status (withdrawal in progress, awaiting VP payout) */
  redeemedVaults: RedeemedVaultInfo[];
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
  const { findProvider } = useVaultProviders();

  // When redeemed vaults exist, we poll so the indexer's DEPOSITOR_WITHDRAWN
  // update (from btc-monitor detecting the vault UTXO spend) gets picked up
  // and the vault disappears from the pending withdraw section.
  // Uses state (not ref) so the transition to zero redeemed vaults triggers
  // a re-render that stops polling.
  const [hasRedeemedVaults, setHasRedeemedVaults] = useState(false);

  const {
    data: vaults,
    isLoading: vaultsLoading,
    error,
  } = useVaults(depositorAddress as Address | undefined, {
    poll: hasPendingOperations || hasRedeemedVaults,
  });
  const btcPriceUSD = usePrice("BTC");

  const isLoading = vaultsLoading;

  // Filter to active vaults only
  const activeVaults = useMemo(() => {
    if (!vaults) return [];
    return vaults.filter((vault) => vault.status === ContractStatus.ACTIVE);
  }, [vaults]);

  // Vaults with "redeemed" status — withdrawal initiated, VP is processing BTC payout
  const redeemedVaults: RedeemedVaultInfo[] = useMemo(() => {
    if (!vaults) return [];
    return vaults
      .filter((vault) => vault.status === ContractStatus.REDEEMED)
      .map((vault) => {
        const provider = findProvider(vault.vaultProvider);
        const providerName = formatProviderDisplayName(
          provider?.name,
          vault.vaultProvider,
        );
        return {
          id: vault.id,
          amountBtc: satoshiToBtcNumber(vault.amount),
          providerName,
          providerIconUrl: provider?.iconUrl,
          vaultProviderAddress: vault.vaultProvider,
          createdAt: vault.createdAt,
        };
      });
  }, [vaults, findProvider]);

  useEffect(() => {
    setHasRedeemedVaults(redeemedVaults.length > 0);
  }, [redeemedVaults.length]);

  const allVaults = useMemo(() => {
    return activeVaults.map((vault) => {
      const provider = findProvider(vault.vaultProvider);
      return transformVaultToTableData(vault, btcPriceUSD, provider);
    });
  }, [activeVaults, btcPriceUSD, findProvider]);

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
    availableForCollateral,
    redeemedVaults,
    isLoading,
    error: error as Error | null,
  };
}
