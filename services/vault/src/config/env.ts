/**
 * Centralized Environment Variables Validation
 *
 * This file validates all critical environment variables at application startup.
 * If any required variables are missing, the application will fail fast with a clear error message.
 */

import type { Address } from "viem";

/**
 * Required environment variables for the vault application
 */
interface RequiredEnvVars {
  // Contract addresses
  BTC_VAULTS_MANAGER: Address;
  VAULT_CONTROLLER: Address;
  BTC_VAULT: Address;
  MORPHO: Address;

  // API endpoints
  VAULT_API_URL: string;
  MEMPOOL_API: string;

  // Optional with defaults
  VAULT_PROVIDER_RPC_URL?: string;
}

/**
 * Validate and extract all required environment variables
 */
function validateEnvVars(): RequiredEnvVars {
  const envVars = {
    // Contract addresses (required)
    BTC_VAULTS_MANAGER: process.env.NEXT_PUBLIC_TBV_BTC_VAULTS_MANAGER,
    VAULT_CONTROLLER: process.env.NEXT_PUBLIC_TBV_VAULT_CONTROLLER,
    BTC_VAULT: process.env.NEXT_PUBLIC_TBV_BTC_VAULT,
    MORPHO: process.env.NEXT_PUBLIC_TBV_MORPHO,

    // API endpoints (required)
    VAULT_API_URL: process.env.NEXT_PUBLIC_VAULT_API_URL,
    MEMPOOL_API: process.env.NEXT_PUBLIC_MEMPOOL_API,

    // Optional (has default)
    VAULT_PROVIDER_RPC_URL: process.env.NEXT_PUBLIC_VAULT_PROVIDER_RPC_URL,
  };

  // Check for missing required environment variables
  const requiredVars = [
    "BTC_VAULTS_MANAGER",
    "VAULT_CONTROLLER",
    "BTC_VAULT",
    "MORPHO",
    "VAULT_API_URL",
    "MEMPOOL_API",
  ] as const;

  const missingVars = requiredVars.filter(
    (key) => !envVars[key as keyof typeof envVars],
  );

  if (missingVars.length > 0) {
    const missingVarNames = missingVars.map((key) => {
      // Map internal names to actual env var names
      const envVarMap: Record<string, string> = {
        BTC_VAULTS_MANAGER: "NEXT_PUBLIC_TBV_BTC_VAULTS_MANAGER",
        VAULT_CONTROLLER: "NEXT_PUBLIC_TBV_VAULT_CONTROLLER",
        BTC_VAULT: "NEXT_PUBLIC_TBV_BTC_VAULT",
        MORPHO: "NEXT_PUBLIC_TBV_MORPHO",
        VAULT_API_URL: "NEXT_PUBLIC_VAULT_API_URL",
        MEMPOOL_API: "NEXT_PUBLIC_MEMPOOL_API",
      };
      return envVarMap[key] || key;
    });

    throw new Error(
      `Missing required environment variables:\n  - ${missingVarNames.join("\n  - ")}\n\n` +
        "Please configure these variables in your .env file.\n" +
        "See .env.example for reference.",
    );
  }

  return envVars as RequiredEnvVars;
}

/**
 * Validated environment variables
 * This will throw an error at module load time if any required variables are missing
 */
export const ENV = validateEnvVars();

/**
 * Default values for optional environment variables
 */
export const ENV_DEFAULTS = {
  VAULT_PROVIDER_RPC_URL: "http://localhost:8080",
} as const;
