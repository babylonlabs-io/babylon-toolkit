/**
 * Shared network-contract resolution for the real-wallet E2E pre-flights (pegin + borrow).
 *
 * Contracts and endpoints come from the same committed profile the app inlines
 * (services/vault/networks/<name>.json), so a `pnpm sync-env` rotation is picked up
 * automatically. Only NEXT_PUBLIC_ETH_RPC_URL may be overridden, from the vault .env,
 * exactly as the app allows.
 */
import { AaveIntegrationAdapterABI } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import { gql, GraphQLClient } from "graphql-request";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  http,
  type Address,
  type PublicClient,
} from "viem";
import { sepolia } from "viem/chains";
import { loadEnv } from "vite";

import { readResolvedNetworkProfile } from "../../scripts/lib/networkProfiles";

import { NETWORKS, type NetworkName } from "./config";

/** The immutable Core Spoke getter on the AaveIntegrationAdapter (read on-chain, never trusted from GraphQL). */
const CORE_SPOKE_FN = "BTC_VAULT_CORE_SPOKE";

/** The vault service root (holds .env), relative to this file. */
const VAULT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Networks whose resolved env we've already surfaced, so we log it once per process (not per call). */
const loggedNetworks = new Set<NetworkName>();

export interface NetworkContracts {
  registry: Address;
  /** AaveIntegrationAdapter (app controller), from the profile's contracts.aaveAdapter. Also the Core-Spoke source. */
  appController: string;
  graphqlEndpoint: string;
  ethRpcUrl: string;
  /** AaveAdapterConfig — holds the per-position size params (maxVaultsPerPosition). */
  aaveAdapterConfig: Address;
}

/**
 * Resolve the network's contract addresses + endpoints from its committed profile,
 * with the RPC override the app also honours.
 */
export function resolveNetworkContracts(
  network: NetworkName,
): NetworkContracts {
  const profile = readResolvedNetworkProfile(NETWORKS[network].profile);
  const { NEXT_PUBLIC_ETH_RPC_URL } = loadEnv(
    "development",
    VAULT_ROOT,
    "NEXT_PUBLIC_",
  );
  const ethRpcUrl = NEXT_PUBLIC_ETH_RPC_URL?.trim() || profile.ethRpcUrl;

  if (!loggedNetworks.has(network)) {
    loggedNetworks.add(network);
    // eslint-disable-next-line no-console
    console.log(
      `[network-contracts] ${network} (profile ${profile.name}): registry ${profile.contracts.btcVaultRegistry}, graphql ${profile.indexerUrl}`,
    );
  }

  return {
    registry: profile.contracts.btcVaultRegistry as Address,
    appController: profile.contracts.aaveAdapter,
    graphqlEndpoint: profile.indexerUrl,
    ethRpcUrl,
    aaveAdapterConfig: profile.contracts.aaveAdapterConfig as Address,
  };
}

/** A Sepolia public client for the network's ETH RPC (the same reads the app performs). */
export function createEthClient(ethRpcUrl: string): PublicClient {
  return createPublicClient({
    chain: sepolia,
    transport: http(ethRpcUrl),
  }) as PublicClient;
}

/**
 * Resolve the Aave Core Spoke on-chain from the env-pinned adapter (mirrors the app's
 * getCoreSpokeAddress — never trust a GraphQL-supplied spoke). Every spoke read (risk params, account
 * data, oracle) hangs off this address.
 */
export async function resolveCoreSpoke(
  client: PublicClient,
  appController: string,
): Promise<Address> {
  return (await client.readContract({
    address: appController as Address,
    abi: AaveIntegrationAdapterABI,
    functionName: CORE_SPOKE_FN,
    args: [],
  })) as Address;
}

/** An indexer GraphQL client for the network's endpoint — one place to add default headers/timeouts. */
export function createGraphQLClient(graphqlEndpoint: string): GraphQLClient {
  return new GraphQLClient(graphqlEndpoint);
}

const GET_VBTC_RESERVE_ID = gql`
  query GetVaultBtcReserveId {
    aaveConfig(id: 1) {
      vaultBtcReserveId
    }
  }
`;

interface VbtcReserveIdResponse {
  aaveConfig: { vaultBtcReserveId: string } | null;
}

/**
 * Read the vBTC (collateral) reserve id from the indexer's singleton `aaveConfig`. Used by the pegin
 * split-minimum (`peginParams.fetchMinDepositForSplitBtc`). Note: `borrowParams.fetchAaveReserveConfig`
 * does NOT call this — it reads the id as part of one combined query (`aaveConfig` + `aaveReserves` in a
 * single round-trip), the right trade-off there; this just centralizes the `aaveConfig(id:1)` key + null
 * contract for the pegin path.
 */
export async function fetchVbtcReserveId(
  graphqlEndpoint: string,
): Promise<bigint> {
  const { aaveConfig } =
    await createGraphQLClient(graphqlEndpoint).request<VbtcReserveIdResponse>(
      GET_VBTC_RESERVE_ID,
    );
  if (!aaveConfig)
    throw new Error(
      `No aaveConfig from the indexer at ${graphqlEndpoint} — cannot resolve the vBTC reserve id.`,
    );
  return BigInt(aaveConfig.vaultBtcReserveId);
}
