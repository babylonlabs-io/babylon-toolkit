/**
 * Network profile: everything that belongs to one deployment of the vault
 * app. Generated from tbv-networks by scripts/sync-env.ts, inlined at build
 * time by vite.config.ts, validated again at startup by config/env.ts.
 * Dependency-free so vite.config.ts, scripts/ and the browser can share it.
 */

import type { BtcNetworkName } from "./btc";
import {
  BTC_MAINNET,
  BTC_SIGNET,
  ETH_MAINNET_CHAIN_ID,
  ETH_SEPOLIA_CHAIN_ID,
} from "./constants";

export const PROFILE_KINDS = ["production", "test", "internal"] as const;
export type ProfileKind = (typeof PROFILE_KINDS)[number];

export type ProfileEthChainId =
  | typeof ETH_MAINNET_CHAIN_ID
  | typeof ETH_SEPOLIA_CHAIN_ID;

/** Endpoint fields a profile may override while the registry entry is wrong. */
export const OVERRIDABLE_ENDPOINTS = [
  "ethRpcUrl",
  "indexerUrl",
  "vpProxyUrl",
] as const;
export type OverridableEndpoint = (typeof OVERRIDABLE_ENDPOINTS)[number];

export interface NetworkProfileContracts {
  btcVaultRegistry: string;
  aaveAdapter: string;
  aaveAdapterConfig: string;
  btcPriceFeed?: string;
}

export type NetworkProfileOverrides = Partial<
  Record<OverridableEndpoint, string>
> & { reason: string };

export interface NetworkProfile {
  name: string;
  kind: ProfileKind;
  /** tbv-networks commit the profile was generated from; null for hand-written profiles. */
  registryCommit: string | null;
  btcNetwork: BtcNetworkName;
  ethChainId: ProfileEthChainId;
  ethRpcUrl: string;
  indexerUrl: string;
  vpProxyUrl: string;
  contracts: NetworkProfileContracts;
  overrides?: NetworkProfileOverrides;
}

const PROFILE_KEYS = [
  "name",
  "kind",
  "registryCommit",
  "btcNetwork",
  "ethChainId",
  "ethRpcUrl",
  "indexerUrl",
  "vpProxyUrl",
  "contracts",
  "overrides",
] as const;

const CONTRACT_KEYS = [
  "btcVaultRegistry",
  "aaveAdapter",
  "aaveAdapterConfig",
  "btcPriceFeed",
] as const;

const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const REGISTRY_COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ALLOWED_URL_PROTOCOLS = ["http:", "https:"];

type Problems = string[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function checkEndpoint(
  value: unknown,
  field: string,
  problems: Problems,
): string | undefined {
  if (typeof value !== "string" || value.length === 0) {
    problems.push(`${field} must be a non-empty string`);
    return undefined;
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    problems.push(`${field} must be an http(s) URL, got "${value}"`);
    return undefined;
  }
  if (!ALLOWED_URL_PROTOCOLS.includes(parsed.protocol)) {
    problems.push(`${field} must be an http(s) URL, got "${value}"`);
    return undefined;
  }
  if (value.endsWith("/")) {
    problems.push(`${field} must not end with "/"`);
    return undefined;
  }
  return value;
}

function checkAddress(
  value: unknown,
  field: string,
  problems: Problems,
): string | undefined {
  if (typeof value !== "string" || !ADDRESS_PATTERN.test(value)) {
    problems.push(
      `${field} must be a 20-byte hex address, got "${String(value)}"`,
    );
    return undefined;
  }
  if (value.toLowerCase() === ZERO_ADDRESS) {
    problems.push(`${field} must not be the zero address`);
    return undefined;
  }
  return value;
}

function checkContracts(
  value: unknown,
  problems: Problems,
): NetworkProfileContracts | undefined {
  if (!isRecord(value)) {
    problems.push("contracts must be an object");
    return undefined;
  }
  for (const key of Object.keys(value)) {
    if (!(CONTRACT_KEYS as readonly string[]).includes(key)) {
      problems.push(`unexpected key contracts.${key}`);
    }
  }
  const btcVaultRegistry = checkAddress(
    value.btcVaultRegistry,
    "contracts.btcVaultRegistry",
    problems,
  );
  const aaveAdapter = checkAddress(
    value.aaveAdapter,
    "contracts.aaveAdapter",
    problems,
  );
  const aaveAdapterConfig = checkAddress(
    value.aaveAdapterConfig,
    "contracts.aaveAdapterConfig",
    problems,
  );
  const btcPriceFeed =
    value.btcPriceFeed === undefined
      ? undefined
      : checkAddress(value.btcPriceFeed, "contracts.btcPriceFeed", problems);
  if (!btcVaultRegistry || !aaveAdapter || !aaveAdapterConfig) return undefined;
  return btcPriceFeed === undefined
    ? { btcVaultRegistry, aaveAdapter, aaveAdapterConfig }
    : { btcVaultRegistry, aaveAdapter, aaveAdapterConfig, btcPriceFeed };
}

function checkOverrides(
  value: unknown,
  problems: Problems,
): NetworkProfileOverrides | undefined {
  if (!isRecord(value)) {
    problems.push("overrides must be an object");
    return undefined;
  }
  const overrides: Partial<Record<OverridableEndpoint, string>> = {};
  for (const key of Object.keys(value)) {
    if (key === "reason") continue;
    if (!(OVERRIDABLE_ENDPOINTS as readonly string[]).includes(key)) {
      problems.push(
        `overrides may only set ${OVERRIDABLE_ENDPOINTS.join(", ")}, got ${key}`,
      );
      continue;
    }
    const endpoint = checkEndpoint(value[key], `overrides.${key}`, problems);
    if (endpoint) overrides[key as OverridableEndpoint] = endpoint;
  }
  if (typeof value.reason !== "string" || value.reason.trim().length === 0) {
    problems.push("overrides.reason must be a non-empty string");
    return undefined;
  }
  return { ...overrides, reason: value.reason };
}

/** Validate an untrusted value as a profile. Throws listing every problem. */
export function parseNetworkProfile(raw: unknown): NetworkProfile {
  if (!isRecord(raw)) {
    throw new Error("Invalid network profile: expected an object");
  }
  const problems: Problems = [];

  for (const key of Object.keys(raw)) {
    if (!(PROFILE_KEYS as readonly string[]).includes(key)) {
      problems.push(`unexpected key ${key}`);
    }
  }

  const name = typeof raw.name === "string" ? raw.name : "";
  if (!NAME_PATTERN.test(name)) {
    problems.push(
      `name must match /^[a-z0-9][a-z0-9-]*$/, got "${String(raw.name)}"`,
    );
  }

  const kind = raw.kind;
  if (!(PROFILE_KINDS as readonly unknown[]).includes(kind)) {
    problems.push(
      `kind must be one of ${PROFILE_KINDS.join(", ")}, got "${String(kind)}"`,
    );
  }

  const registryCommit = raw.registryCommit;
  if (
    registryCommit !== null &&
    (typeof registryCommit !== "string" ||
      !REGISTRY_COMMIT_PATTERN.test(registryCommit))
  ) {
    problems.push("registryCommit must be a 40-hex commit sha or null");
  }

  const btcNetwork = raw.btcNetwork;
  if (btcNetwork !== BTC_MAINNET && btcNetwork !== BTC_SIGNET) {
    problems.push(
      `btcNetwork must be "${BTC_MAINNET}" or "${BTC_SIGNET}", got "${String(btcNetwork)}"`,
    );
  }

  const ethChainId = raw.ethChainId;
  if (
    ethChainId !== ETH_MAINNET_CHAIN_ID &&
    ethChainId !== ETH_SEPOLIA_CHAIN_ID
  ) {
    problems.push(
      `ethChainId must be ${ETH_MAINNET_CHAIN_ID} or ${ETH_SEPOLIA_CHAIN_ID}, got ${String(ethChainId)}`,
    );
  }

  const ethRpcUrl = checkEndpoint(raw.ethRpcUrl, "ethRpcUrl", problems);
  const indexerUrl = checkEndpoint(raw.indexerUrl, "indexerUrl", problems);
  const vpProxyUrl = checkEndpoint(raw.vpProxyUrl, "vpProxyUrl", problems);
  const contracts = checkContracts(raw.contracts, problems);
  const overrides =
    raw.overrides === undefined
      ? undefined
      : checkOverrides(raw.overrides, problems);

  const kindValid = (PROFILE_KINDS as readonly unknown[]).includes(kind);
  const btcValid = btcNetwork === BTC_MAINNET || btcNetwork === BTC_SIGNET;
  const ethValid =
    ethChainId === ETH_MAINNET_CHAIN_ID || ethChainId === ETH_SEPOLIA_CHAIN_ID;
  if (kindValid && btcValid && ethValid) {
    try {
      assertPairingAllowed({
        kind: kind as ProfileKind,
        btcNetwork: btcNetwork as BtcNetworkName,
        ethChainId: ethChainId as ProfileEthChainId,
      });
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (problems.length > 0) {
    throw new Error(`Invalid network profile: ${problems.join("; ")}`);
  }

  const profile: NetworkProfile = {
    name,
    kind: kind as ProfileKind,
    registryCommit: registryCommit as string | null,
    btcNetwork: btcNetwork as BtcNetworkName,
    ethChainId: ethChainId as ProfileEthChainId,
    ethRpcUrl: ethRpcUrl as string,
    indexerUrl: indexerUrl as string,
    vpProxyUrl: vpProxyUrl as string,
    contracts: contracts as NetworkProfileContracts,
  };
  return overrides === undefined ? profile : { ...profile, overrides };
}

/** Apply endpoint overrides and drop the block; the result is what the app runs on. */
export function resolveNetworkProfile(profile: NetworkProfile): NetworkProfile {
  if (profile.overrides === undefined) return profile;
  const { overrides, ...rest } = profile;
  const endpoints: Partial<Record<OverridableEndpoint, string>> = {};
  for (const key of OVERRIDABLE_ENDPOINTS) {
    const value = overrides[key];
    if (value !== undefined) endpoints[key] = value;
  }
  return { ...rest, ...endpoints };
}

const ALLOWED_PAIRING: Record<
  ProfileKind,
  { btcNetwork: BtcNetworkName; ethChainId: ProfileEthChainId }
> = {
  production: { btcNetwork: BTC_MAINNET, ethChainId: ETH_MAINNET_CHAIN_ID },
  test: { btcNetwork: BTC_SIGNET, ethChainId: ETH_SEPOLIA_CHAIN_ID },
  internal: { btcNetwork: BTC_MAINNET, ethChainId: ETH_SEPOLIA_CHAIN_ID },
};

/** The profile's kind decides which Bitcoin and Ethereum networks it may pair. */
export function assertPairingAllowed(
  profile: Pick<NetworkProfile, "kind" | "btcNetwork" | "ethChainId">,
): void {
  const allowed = ALLOWED_PAIRING[profile.kind];
  if (
    allowed.btcNetwork === profile.btcNetwork &&
    allowed.ethChainId === profile.ethChainId
  ) {
    return;
  }
  const table = (Object.keys(ALLOWED_PAIRING) as ProfileKind[])
    .map(
      (k) =>
        `${k}=${ALLOWED_PAIRING[k].btcNetwork}+${ALLOWED_PAIRING[k].ethChainId}`,
    )
    .join(", ");
  throw new Error(
    `Invalid network pairing for kind "${profile.kind}": btcNetwork="${profile.btcNetwork}" with ethChainId=${profile.ethChainId}. Allowed: ${table}.`,
  );
}
