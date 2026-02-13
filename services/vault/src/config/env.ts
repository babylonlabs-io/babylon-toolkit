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
interface EnvVars {
  BTC_VAULTS_MANAGER: Address;
  AAVE_CONTROLLER: Address;
  GRAPHQL_ENDPOINT: string;
  SIDECAR_API_URL: string;
}

interface EnvValidationResult {
  env: EnvVars;
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

    // API endpoints (required)
    GRAPHQL_ENDPOINT: process.env.NEXT_PUBLIC_TBV_GRAPHQL_ENDPOINT,
    SIDECAR_API_URL: (
      process.env.NEXT_PUBLIC_TBV_SIDECAR_API_URL ?? ""
    ).replace(/\/$/, ""),
  };

  const requiredVars = [
    "BTC_VAULTS_MANAGER",
    "AAVE_CONTROLLER",
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
      GRAPHQL_ENDPOINT: "NEXT_PUBLIC_TBV_GRAPHQL_ENDPOINT",
    };

    const missingVarNames = missingVars.map((key) => envVarMap[key] || key);

    return {
      env: {
        BTC_VAULTS_MANAGER: ZERO_ADDRESS,
        AAVE_CONTROLLER: ZERO_ADDRESS,
        GRAPHQL_ENDPOINT: "",
        SIDECAR_API_URL: "",
      },
      error: `Missing: ${missingVarNames.join(", ")}`,
    };
  }

  return {
    env: envVars as EnvVars,
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
