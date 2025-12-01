/**
 * Vault data transformation utilities
 * Converts blockchain/GraphQL vault data to UI-friendly formats
 */

import { getPeginState } from "../models/peginStateMachine";
import type { Vault, VaultActivity } from "../types";

import { formatSatoshisToBtc } from "./btcConversion";
import { formatUSDCAmount } from "./tokenConversion";

/**
 * Bitcoin icon as data URI (orange bitcoin logo)
 */
const BITCOIN_ICON_DATA_URI =
  "data:image/svg+xml,%3Csvg viewBox='0 0 24 24' fill='%23FF7C2A' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M23.638 14.904c-1.602 6.43-8.113 10.34-14.542 8.736C2.67 22.05-1.244 15.525.362 9.105 1.962 2.67 8.475-1.243 14.9.358c6.43 1.605 10.342 8.115 8.738 14.548v-.002zm-6.35-4.613c.24-1.59-.974-2.45-2.64-3.03l.54-2.153-1.315-.33-.525 2.107c-.345-.087-.705-.167-1.064-.25l.526-2.127-1.32-.33-.54 2.165c-.285-.067-.565-.132-.84-.2l-1.815-.45-.35 1.407s.975.225.955.236c.535.136.63.486.615.766l-1.477 5.92c-.075.166-.24.406-.614.314.015.02-.96-.24-.96-.24l-.66 1.51 1.71.426.93.242-.54 2.19 1.32.327.54-2.17c.36.1.705.19 1.05.273l-.51 2.154 1.32.33.545-2.19c2.24.427 3.93.257 4.64-1.774.57-1.637-.03-2.58-1.217-3.196.854-.193 1.5-.76 1.68-1.93h.01zm-3.01 4.22c-.404 1.64-3.157.75-4.05.53l.72-2.9c.896.23 3.757.67 3.33 2.37zm.41-4.24c-.37 1.49-2.662.735-3.405.55l.654-2.64c.744.18 3.137.524 2.75 2.084v.006z'/%3E%3C/svg%3E";

/**
 * Get formatted total repay amount from activity
 * Returns the total amount to repay including principal and accrued interest
 * @param activity - VaultActivity with morphoPosition and borrowingData
 * @returns Formatted repay amount string (e.g., "1050.00 USDC") or "0 USDC" if no position
 */
export function getFormattedRepayAmount(activity: VaultActivity): string {
  if (!activity.morphoPosition || !activity.borrowingData) {
    return "0 USDC";
  }

  const totalAmount = formatUSDCAmount(activity.morphoPosition.borrowAssets);
  return `${totalAmount} ${activity.borrowingData.borrowedSymbol}`;
}

/**
 * Transform Vault data to VaultActivity UI format
 * For Deposit tab - shows vault status but not full Morpho loan details
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
      symbol: "BTC",
      icon: BITCOIN_ICON_DATA_URI,
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
    // No action handlers - these are attached at the component level
    action: undefined,
    // No Morpho position details in deposit tab
    morphoPosition: undefined,
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
