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
} as const;

// Check for missing environment variables
const missingVars = Object.entries(requiredEnvVars)
  .filter(([_, value]) => !value)
  .map(([key]) => `NEXT_PUBLIC_TBV_${key}`);

if (missingVars.length > 0) {
  console.warn(
    `[contracts] Missing environment variables: ${missingVars.join(', ')}. Vault features may be unavailable.`
  );
}

export const CONTRACTS = {
  /**
   * BTCVaultsManager contract - Manages vault providers and pegin requests
   */
  BTC_VAULTS_MANAGER: (requiredEnvVars.BTC_VAULTS_MANAGER || '0x0') as Address,

  /**
   * VaultController contract - Controls vault operations and borrowing
   */
  VAULT_CONTROLLER: (requiredEnvVars.VAULT_CONTROLLER || '0x0') as Address,
} as const;

