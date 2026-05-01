/**
 * Centralized Environment Variables Validation
 *
 * This file validates all critical environment variables at application startup.
 * If any required variables are missing, an error is tracked and shown to the user
 * via a blocking modal instead of crashing the application.
 */

import { isAddress, type Address } from "viem";

import {
  configureBabylonConfig,
  type BtcNetworkName,
  type EthChainId,
} from "@/config/network";
import { logger } from "@/infrastructure";

/**
 * Environment variables for the vault application
 */
interface EnvVars {
  BTC_VAULT_REGISTRY: Address;
  AAVE_ADAPTER: Address;
  GRAPHQL_ENDPOINT: string;
  SIDECAR_API_URL: string | undefined;
  BTC_PRICE_FEED: Address | undefined;
  VP_PROXY_URL: string;
  UTILS_API_URL: string | undefined;
}

interface EnvValidationResult {
  env: EnvVars;
  error: string | null;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

const ALLOWED_URL_SCHEMES = ["https:", "http:"];

function parseOptionalUrl(value: string | undefined): string | undefined {
  const trimmed = (value ?? "").trim().replace(/\/$/, "");
  if (!trimmed) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    logger.warn(`Invalid URL in env config: "${trimmed}", ignoring.`);
    return undefined;
  }
  if (!ALLOWED_URL_SCHEMES.includes(parsed.protocol)) {
    logger.warn(
      `URL in env config must use http or https scheme, got: "${parsed.protocol}", ignoring.`,
    );
    return undefined;
  }
  return trimmed;
}

export function parseOptionalAddress(
  value: string | undefined,
): Address | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (!isAddress(trimmed, { strict: false })) {
    logger.warn(`Invalid address in env config: "${trimmed}", ignoring.`);
    return undefined;
  }
  if (trimmed.toLowerCase() === ZERO_ADDRESS) {
    logger.warn(`Zero address in env config: "${trimmed}", ignoring.`);
    return undefined;
  }
  return trimmed as Address;
}

export function validateRequiredAddress(
  value: string | undefined,
  envVarName: string,
  errors: string[],
): Address {
  const trimmed = value?.trim();
  if (!trimmed) {
    errors.push(`${envVarName} is missing`);
    return ZERO_ADDRESS;
  }
  if (!isAddress(trimmed, { strict: false })) {
    errors.push(`${envVarName} is not a valid EVM address: "${trimmed}"`);
    return ZERO_ADDRESS;
  }
  if (trimmed.toLowerCase() === ZERO_ADDRESS) {
    errors.push(`${envVarName} must not be the zero address`);
    return ZERO_ADDRESS;
  }
  return trimmed as Address;
}

export function validateRequiredUrl(
  value: string | undefined,
  envVarName: string,
  errors: string[],
): string {
  const trimmed = (value ?? "").trim().replace(/\/$/, "");
  if (!trimmed) {
    errors.push(`${envVarName} is missing`);
    return "";
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    errors.push(`${envVarName} is not a valid URL: "${trimmed}"`);
    return "";
  }
  if (!ALLOWED_URL_SCHEMES.includes(parsed.protocol)) {
    errors.push(
      `${envVarName} must use http or https scheme, got: "${parsed.protocol}"`,
    );
    return "";
  }
  return trimmed;
}

const ETH_MAINNET_CHAIN_ID = 1;
const ETH_SEPOLIA_CHAIN_ID = 11155111;

function validateEthChainId(
  value: string | undefined,
  errors: string[],
): EthChainId {
  if (!value) {
    errors.push("NEXT_PUBLIC_ETH_CHAINID is missing");
    return ETH_SEPOLIA_CHAIN_ID;
  }
  const parsed = parseInt(value, 10);
  if (parsed !== ETH_MAINNET_CHAIN_ID && parsed !== ETH_SEPOLIA_CHAIN_ID) {
    errors.push(
      `NEXT_PUBLIC_ETH_CHAINID must be '1' (mainnet) or '11155111' (sepolia), got "${value}"`,
    );
    return ETH_SEPOLIA_CHAIN_ID;
  }
  return parsed;
}

function validateBtcNetwork(
  value: string | undefined,
  errors: string[],
): BtcNetworkName {
  if (value !== "mainnet" && value !== "signet") {
    errors.push(
      `NEXT_PUBLIC_BTC_NETWORK must be "mainnet" or "signet", got "${value ?? ""}"`,
    );
    return "signet";
  }
  return value;
}

/**
 * Validate and extract all required environment variables
 */
function validateEnvVars(): EnvValidationResult {
  const errors: string[] = [];

  const BTC_VAULT_REGISTRY = validateRequiredAddress(
    process.env.NEXT_PUBLIC_TBV_BTC_VAULT_REGISTRY,
    "NEXT_PUBLIC_TBV_BTC_VAULT_REGISTRY",
    errors,
  );
  const AAVE_ADAPTER = validateRequiredAddress(
    process.env.NEXT_PUBLIC_TBV_AAVE_ADAPTER,
    "NEXT_PUBLIC_TBV_AAVE_ADAPTER",
    errors,
  );
  const GRAPHQL_ENDPOINT = validateRequiredUrl(
    process.env.NEXT_PUBLIC_TBV_GRAPHQL_ENDPOINT,
    "NEXT_PUBLIC_TBV_GRAPHQL_ENDPOINT",
    errors,
  );
  const SIDECAR_API_URL = parseOptionalUrl(
    process.env.NEXT_PUBLIC_TBV_SIDECAR_API_URL,
  );
  const VP_PROXY_URL = validateRequiredUrl(
    process.env.NEXT_PUBLIC_TBV_VP_PROXY_URL,
    "NEXT_PUBLIC_TBV_VP_PROXY_URL",
    errors,
  );
  const UTILS_API_URL = parseOptionalUrl(process.env.NEXT_PUBLIC_TBV_UTILS_API);
  const BTC_PRICE_FEED = parseOptionalAddress(
    process.env.NEXT_PUBLIC_TBV_BTC_PRICE_FEED,
  );

  const ethChainId = validateEthChainId(
    process.env.NEXT_PUBLIC_ETH_CHAINID,
    errors,
  );
  const ethRpcUrl = validateRequiredUrl(
    process.env.NEXT_PUBLIC_ETH_RPC_URL,
    "NEXT_PUBLIC_ETH_RPC_URL",
    errors,
  );
  const btcNetwork = validateBtcNetwork(
    process.env.NEXT_PUBLIC_BTC_NETWORK,
    errors,
  );
  const mempoolApiUrl = parseOptionalUrl(process.env.NEXT_PUBLIC_MEMPOOL_API);

  // Initialize the vault network config runtime from validated env
  // values. The runtime MUST end up initialized after this point even
  // when validation fails — module loads later in the import graph
  // (e.g. ethClient singleton) read config at evaluation time, and an
  // uninitialized runtime would crash the app before the blocking
  // error modal could render.
  //
  // Strategy: try the real values; on any throw (e.g. invalid pairing),
  // record the message and re-init with a known-valid signet/sepolia
  // fallback so downstream readers succeed. `envInitError` then drives
  // the blocking error modal.
  const FALLBACK_ETH_CHAIN_ID: EthChainId = ETH_SEPOLIA_CHAIN_ID;
  const FALLBACK_BTC_NETWORK: BtcNetworkName = "signet";
  const FALLBACK_RPC_URL = "http://invalid.local";
  try {
    configureBabylonConfig({
      ethChainId,
      ethRpcUrl: ethRpcUrl || FALLBACK_RPC_URL,
      btcNetwork,
      mempoolApiUrl,
    });
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
    try {
      configureBabylonConfig({
        ethChainId: FALLBACK_ETH_CHAIN_ID,
        ethRpcUrl: FALLBACK_RPC_URL,
        btcNetwork: FALLBACK_BTC_NETWORK,
        mempoolApiUrl,
      });
    } catch {
      // Already initialized by a partial earlier call (e.g. the
      // double-init guard fired). Safe to ignore — runtime is set.
    }
  }

  const env: EnvVars = {
    BTC_VAULT_REGISTRY,
    AAVE_ADAPTER,
    GRAPHQL_ENDPOINT,
    SIDECAR_API_URL,
    VP_PROXY_URL,
    UTILS_API_URL,
    BTC_PRICE_FEED,
  };

  if (errors.length > 0) {
    return { env, error: errors.join("; ") };
  }

  return { env, error: null };
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
