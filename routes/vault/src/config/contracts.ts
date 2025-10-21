/**
 * Smart Contract Addresses Configuration
 *
 * Environment variables must be set for the service to function properly.
 * No fallback values are provided to ensure explicit configuration.
 */

import type { Address } from 'viem';

// Validate required environment variables
const requiredEnvVars = {
  BTC_VAULTS_MANAGER: process.env.NEXT_PUBLIC_TBV_BTC_VAULTS_MANAGER,
  VAULT_CONTROLLER: process.env.NEXT_PUBLIC_TBV_VAULT_CONTROLLER,
  BTC_VAULT: process.env.NEXT_PUBLIC_TBV_BTC_VAULT,
  MORPHO: process.env.NEXT_PUBLIC_TBV_MORPHO,
} as const;

// Check for missing environment variables
const missingVars = Object.entries(requiredEnvVars)
  .filter(([_, value]) => !value)
  .map(([key]) => `NEXT_PUBLIC_TBV_${key}`);

if (missingVars.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missingVars.join(', ')}`
  );
}

export const CONTRACTS = {
  /**
   * BTCVaultsManager contract - Manages vault providers and pegin requests
   */
  BTC_VAULTS_MANAGER: requiredEnvVars.BTC_VAULTS_MANAGER as Address,

  /**
   * VaultController contract - Controls vault operations and borrowing
   */
  VAULT_CONTROLLER: requiredEnvVars.VAULT_CONTROLLER as Address,

  /**
   * BTCVault base contract
   */
  BTC_VAULT: requiredEnvVars.BTC_VAULT as Address,

  /**
   * Morpho Blue contract - Lending protocol for borrowing against BTC vault collateral
   */
  MORPHO: requiredEnvVars.MORPHO as Address,
} as const;
