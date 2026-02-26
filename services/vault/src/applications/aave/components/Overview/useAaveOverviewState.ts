/**
 * useAaveOverviewState Hook
 *
 * Manages all state and data fetching for the AaveOverview component.
 * Extracts business logic from the UI component for better separation of concerns.
 */

import { useCallback, useMemo } from "react";

import { useVaultRedeemState } from "@/context/deposit/VaultRedeemState";
import {
  getPeginState,
  PEGIN_DISPLAY_LABELS,
} from "@/models/peginStateMachine";
import type { VaultActivity } from "@/types/activity";
import type { Deposit, Vault } from "@/types/vault";
import { satoshiToBtcNumber } from "@/utils/btcConversion";

import { usePendingVaults, useSyncPendingVaults } from "../../context";
import {
  useAaveBorrowedAssets,
  useAaveUserPosition,
  useAaveVaults,
} from "../../hooks";
import type { Asset, VaultData } from "../../types";

/**
 * Transform VaultData to Deposit format for redeem modals
 */
function vaultToDeposit(vault: VaultData): Deposit {
  return {
    id: vault.id,
    amount: vault.amount,
    pegInTxHash: vault.id,
    status: vault.status,
    timestamp: undefined,
  };
}

/**
 * Transform raw Vault to VaultActivity format for redeem sign modal
 * Only includes the fields needed for redemption
 */
function vaultToActivity(vault: Vault): VaultActivity {
  const peginState = getPeginState(vault.status, { isInUse: vault.isInUse });

  return {
    id: vault.id,
    txHash: vault.id,
    applicationController: vault.applicationController,
    collateral: {
      amount: satoshiToBtcNumber(vault.amount).toString(),
      symbol: "BTC",
    },
    providers: [{ id: vault.vaultProvider }],
    displayLabel: peginState.displayLabel,
    contractStatus: vault.status,
    isInUse: vault.isInUse,
  };
}

export function useAaveOverviewState(address: string | undefined) {
  // Fetch user's Aave position
  const {
    position,
    collateralBtc,
    collateralValueUsd,
    debtValueUsd,
    healthFactor,
    healthFactorStatus,
  } = useAaveUserPosition(address);

  // Fetch user's vaults (for display and redeem operations)
  const { vaults, rawVaults } = useAaveVaults(address);

  // Get pending state and sync with indexed vault data
  const { hasPendingWithdraw, markVaultsAsPending } = usePendingVaults();
  useSyncPendingVaults(vaults);

  // Fetch user's borrowed assets (reuses position data to avoid duplicate RPC calls)
  const { borrowedAssets, hasLoans } = useAaveBorrowedAssets({
    position,
    debtValueUsd,
  });

  // Transform borrowed assets for selection modal
  const selectableBorrowedAssets = useMemo(
    (): Asset[] =>
      borrowedAssets.map((asset) => ({
        symbol: asset.symbol,
        name: asset.symbol,
        icon: asset.icon,
      })),
    [borrowedAssets],
  );

  // Transform vaults to Deposit format for redeem modals
  // Only include "Available" vaults (not in use)
  const deposits: Deposit[] = useMemo(() => {
    return vaults
      .filter((v) => v.status === PEGIN_DISPLAY_LABELS.AVAILABLE)
      .map(vaultToDeposit);
  }, [vaults]);

  // Transform raw vaults to VaultActivity format for redeem sign modal
  // This uses the same data source, avoiding duplicate fetches
  const activities: VaultActivity[] = useMemo(() => {
    return rawVaults.map(vaultToActivity);
  }, [rawVaults]);

  // Get redeem trigger and deposit IDs from context
  const { triggerRedeem, redeemDepositIds } = useVaultRedeemState();

  // Callback to mark vaults as pending redeem after successful sign
  const onRedeemSuccess = useCallback(() => {
    if (redeemDepositIds.length > 0) {
      markVaultsAsPending(redeemDepositIds, "redeem");
    }
  }, [redeemDepositIds, markVaultsAsPending]);

  // Derive display values
  const hasCollateral = collateralBtc > 0;

  return {
    // Position data
    collateralBtc,
    collateralValueUsd,
    healthFactor,
    healthFactorStatus,

    // Vaults data
    vaults,
    deposits,
    activities,

    // Pending state
    hasPendingWithdraw,

    // Borrowed assets
    borrowedAssets,
    hasLoans,
    selectableBorrowedAssets,

    // Derived values
    hasCollateral,

    // Redeem - trigger and success callback
    triggerRedeem,
    onRedeemSuccess,
  };
}
