/**
 * Vault data transformation utilities
 * Converts blockchain/GraphQL vault data to UI-friendly formats
 */

import { getNetworkConfigBTC } from "../config";
import { getPeginState } from "../models/peginStateMachine";
import type { Vault, VaultActivity } from "../types";

import { formatSatoshisToBtc } from "./btcConversion";
import { formatUSDCAmount } from "./tokenConversion";

const btcConfig = getNetworkConfigBTC();

/**
 * Get formatted total repay amount from activity
 * Returns the total amount to repay including principal and accrued interest
 * @param activity - VaultActivity with position and borrowingData
 * @returns Formatted repay amount string (e.g., "1050.00 USDC") or "0 USDC" if no position
 */
export function getFormattedRepayAmount(activity: VaultActivity): string {
  if (!activity.position || !activity.borrowingData) {
    return "0 USDC";
  }

  const totalAmount = formatUSDCAmount(activity.position.borrowAssets);
  return `${totalAmount} ${activity.borrowingData.borrowedSymbol}`;
}

/**
 * Transform Vault data to VaultActivity UI format
 * For Deposit tab - shows vault status but not full loan details
 * @param vault - Vault data from GraphQL
 * @returns VaultActivity object ready for UI rendering (without action handlers - those are attached at component level)
 */
export function transformVaultToActivity(vault: Vault): VaultActivity {
  // Convert amount from satoshis to BTC
  const btcAmount = formatSatoshisToBtc(vault.amount);

  // Compute display label from state machine
  const state = getPeginState(vault.status, { isInUse: vault.isInUse });

  // Create VaultActivity object (deposit/collateral info)
  return {
    id: vault.id,
    txHash: vault.id,
    collateral: {
      amount: btcAmount,
      symbol: btcConfig.coinSymbol,
      icon: btcConfig.icon,
    },
    contractStatus: vault.status,
    isInUse: vault.isInUse,
    displayLabel: state.displayLabel,
    providers: [
      {
        id: vault.vaultProvider,
      },
    ],
    applicationController: vault.applicationController,
    timestamp: vault.createdAt,
    depositorBtcPubkey: vault.depositorBtcPubkey,
    // No action handlers - these are attached at the component level
    action: undefined,
    // No position details in deposit tab
    position: undefined,
    borrowingData: undefined,
    marketData: undefined,
    positionDate: undefined,
  };
}

/**
 * Transform multiple Vaults to VaultActivities
 * @param vaults - Array of vault data
 * @returns Array of VaultActivity objects (without action handlers)
 */
export function transformVaultsToActivities(vaults: Vault[]): VaultActivity[] {
  return vaults.map(transformVaultToActivity);
}
