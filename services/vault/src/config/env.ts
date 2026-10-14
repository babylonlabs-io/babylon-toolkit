/**
 * Validates the network profile inlined at build time plus the per-deployment
 * override variables at application startup. Any problem is tracked and shown
 * via a blocking modal instead of crashing the application.
 */

import type { Address } from "viem";

import { configureBabylonConfig } from "@/config/network";
import {
  parseNetworkProfile,
  type NetworkProfile,
} from "@/config/network/profile";
import { logger } from "@/infrastructure";

/**
 * Environment variables for the vault application
 */
interface EnvVars {
  BTC_VAULT_REGISTRY: Address;
  AAVE_ADAPTER: Address;
  AAVE_ADAPTER_CONFIG: Address;
  GRAPHQL_ENDPOINT: string;
  SIDECAR_API_URL: string | undefined;
  BTC_PRICE_FEED: Address | undefined;
  VP_PROXY_URL: string;
  UTILS_API_URL: string | undefined;
  VP_EXPLORER_URL: string | undefined;
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

const ALREADY_CONFIGURED_MESSAGE = "already been called";

const INVALID_LOCAL_URL = "https://invalid.local";

// Keeps the runtime initialised when the inlined profile is unusable, so later
// module loads succeed and the blocking modal can render.
const INERT_FALLBACK_PROFILE: NetworkProfile = {
  name: "fallback",
  kind: "test",
  registryCommit: null,
  btcNetwork: "signet",
  ethChainId: 11155111,
  ethRpcUrl: INVALID_LOCAL_URL,
  indexerUrl: INVALID_LOCAL_URL,
  vpProxyUrl: INVALID_LOCAL_URL,
  contracts: {
    btcVaultRegistry: ZERO_ADDRESS,
    aaveAdapter: ZERO_ADDRESS,
    aaveAdapterConfig: ZERO_ADDRESS,
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Parse the profile vite.config.ts inlined; any problem becomes a config error. */
export function readInlinedProfile(
  raw: string | undefined,
  errors: string[],
): NetworkProfile {
  if (!raw) {
    errors.push(
      "network profile was not inlined at build time (import.meta.env.TBV_NETWORK_PROFILE is empty)",
    );
    return INERT_FALLBACK_PROFILE;
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    errors.push("network profile is not valid JSON");
    return INERT_FALLBACK_PROFILE;
  }
  if (isRecord(json) && typeof json.$error === "string") {
    errors.push(`network profile: ${json.$error}`);
    return INERT_FALLBACK_PROFILE;
  }
  try {
    return parseNetworkProfile(json);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return INERT_FALLBACK_PROFILE;
  }
}

/**
 * Validate the inlined profile and the override variables, then initialise
 * the network runtime. Contract addresses and endpoints come from the profile
 * only; the variables below are per-deployment overrides.
 */
function validateEnvVars(): EnvValidationResult {
  const errors: string[] = [];

  const profile = readInlinedProfile(
    import.meta.env.TBV_NETWORK_PROFILE,
    errors,
  );

  const SIDECAR_API_URL = parseOptionalUrl(
    process.env.NEXT_PUBLIC_TBV_SIDECAR_API_URL,
  );
  // Optional — when unset, the deposit picker omits the per-VP explorer link
  // rather than rendering a broken or environment-mismatched one.
  const VP_EXPLORER_URL = parseOptionalUrl(
    process.env.NEXT_PUBLIC_TBV_VP_EXPLORER_URL,
  );
  const UTILS_API_URL = parseOptionalUrl(process.env.NEXT_PUBLIC_TBV_UTILS_API);
  const mempoolApiUrl = parseOptionalUrl(process.env.NEXT_PUBLIC_MEMPOOL_API);
  // A deployment may point at its own RPC; the profile's is the default.
  const ethRpcUrl =
    parseOptionalUrl(process.env.NEXT_PUBLIC_ETH_RPC_URL) ?? profile.ethRpcUrl;

  // The runtime MUST end up initialised even when the profile is unusable:
  // modules later in the import graph read it at evaluation time.
  try {
    configureBabylonConfig({
      kind: profile.kind,
      networkName: profile.name,
      ethChainId: profile.ethChainId,
      ethRpcUrl,
      btcNetwork: profile.btcNetwork,
      mempoolApiUrl,
    });
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
    try {
      configureBabylonConfig({
        kind: INERT_FALLBACK_PROFILE.kind,
        networkName: INERT_FALLBACK_PROFILE.name,
        ethChainId: INERT_FALLBACK_PROFILE.ethChainId,
        ethRpcUrl: INERT_FALLBACK_PROFILE.ethRpcUrl,
        btcNetwork: INERT_FALLBACK_PROFILE.btcNetwork,
        mempoolApiUrl,
      });
    } catch (retryError) {
      // The first call throws before assigning state; only a double-init can throw here.
      if (
        !(
          retryError instanceof Error &&
          retryError.message.includes(ALREADY_CONFIGURED_MESSAGE)
        )
      ) {
        throw retryError;
      }
    }
  }

  const effective = errors.length > 0 ? INERT_FALLBACK_PROFILE : profile;
  const env: EnvVars = {
    BTC_VAULT_REGISTRY: effective.contracts.btcVaultRegistry as Address,
    AAVE_ADAPTER: effective.contracts.aaveAdapter as Address,
    AAVE_ADAPTER_CONFIG: effective.contracts.aaveAdapterConfig as Address,
    GRAPHQL_ENDPOINT: effective.indexerUrl,
    SIDECAR_API_URL,
    VP_PROXY_URL: effective.vpProxyUrl,
    UTILS_API_URL,
    BTC_PRICE_FEED: effective.contracts.btcPriceFeed as Address | undefined,
    VP_EXPLORER_URL,
  };

  if (errors.length > 0) {
    return { env, error: errors.join("; ") };
  }
  return { env, error: null };
}

const validationResult = validateEnvVars();

/**
 * Validated configuration. When `envInitError` is set these are the inert
 * fallback values (zero addresses, invalid.local).
 */
export const ENV = validationResult.env;

/**
 * Error message if environment validation failed, null otherwise
 */
export const envInitError = validationResult.error;
