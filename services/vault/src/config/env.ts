/**
 * Centralized Environment Variables Validation
 *
 * This file validates all critical environment variables at application startup.
 * If any required variables are missing, an error is tracked and shown to the user
 * via a blocking modal instead of crashing the application.
 */

import type { Address } from "viem";

/**
 * Required environment variables for the vault application
 */
interface RequiredEnvVars {
  // Contract addresses
  BTC_VAULTS_MANAGER: Address;
  AAVE_CONTROLLER: Address;
  BTC_VAULT: Address;

  // API endpoints
  GRAPHQL_ENDPOINT: string;

  // Optional with defaults
  VAULT_PROVIDER_RPC_URL?: string;
  STAKING_API_URL?: string;
}

interface EnvValidationResult {
  env: RequiredEnvVars;
  error: string | null;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

/**
 * Validate and extract all required environment variables
 */
function validateEnvVars(): EnvValidationResult {
  const envVars = {
    // Contract addresses (required)
    BTC_VAULTS_MANAGER: process.env.NEXT_PUBLIC_TBV_BTC_VAULTS_MANAGER,
    AAVE_CONTROLLER: process.env.NEXT_PUBLIC_TBV_AAVE_CONTROLLER,
    BTC_VAULT: process.env.NEXT_PUBLIC_TBV_BTC_VAULT,

    // API endpoints (required)
    GRAPHQL_ENDPOINT: process.env.NEXT_PUBLIC_TBV_GRAPHQL_ENDPOINT,

    // Optional (has default)
    VAULT_PROVIDER_RPC_URL: process.env.NEXT_PUBLIC_VAULT_PROVIDER_RPC_URL,
    STAKING_API_URL: process.env.NEXT_PUBLIC_STAKING_API_URL,
  };

  // Check for missing required environment variables
  const requiredVars = [
    "BTC_VAULTS_MANAGER",
    "AAVE_CONTROLLER",
    "BTC_VAULT",
    "GRAPHQL_ENDPOINT",
  ] as const;

  const missingVars = requiredVars.filter(
    (key) => !envVars[key as keyof typeof envVars],
  );

  if (missingVars.length > 0) {
    // Map internal names to actual env var names
    const envVarMap: Record<string, string> = {
      BTC_VAULTS_MANAGER: "NEXT_PUBLIC_TBV_BTC_VAULTS_MANAGER",
      AAVE_CONTROLLER: "NEXT_PUBLIC_TBV_AAVE_CONTROLLER",
      BTC_VAULT: "NEXT_PUBLIC_TBV_BTC_VAULT",
      GRAPHQL_ENDPOINT: "NEXT_PUBLIC_TBV_GRAPHQL_ENDPOINT",
    };

    const missingVarNames = missingVars.map((key) => envVarMap[key] || key);

    return {
      env: {
        BTC_VAULTS_MANAGER: ZERO_ADDRESS,
        AAVE_CONTROLLER: ZERO_ADDRESS,
        BTC_VAULT: ZERO_ADDRESS,
        GRAPHQL_ENDPOINT: "",
      },
      error: `Missing: ${missingVarNames.join(", ")}`,
    };
  }

  return {
    env: envVars as RequiredEnvVars,
    error: null,
  };
}

const validationResult = validateEnvVars();

/**
 * Validated environment variables
 * If validation failed, these will be fallback values and envInitError will be set
 */
export const ENV = validationResult.env;

/**
 * Error message if environment validation failed, null otherwise
 */
export const envInitError = validationResult.error;

/**
 * Default values for optional environment variables
 */
export const ENV_DEFAULTS = {
  VAULT_PROVIDER_RPC_URL: "http://localhost:8080",
  STAKING_API_URL: "https://staking-api.babylonlabs.io",
} as const;
