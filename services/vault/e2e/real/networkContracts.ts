/**
 * Shared network-contract resolution for the real-wallet E2E pre-flights (pegin + borrow).
 *
 * The contract addresses + endpoints are NOT hardcoded — they rotate (via `scripts/sync-env.mjs`) and
 * differ per network. We resolve them exactly as the app does at runtime: Vite's `loadEnv` for the
 * network's mode (devnet ⇒ `development`, testnet ⇒ `dev-testnet`), which layers `.env` (sync-env's
 * output) + `.env.local` + `.env.<mode>` with the same precedence Vite gives the running dapp.
 *
 * Extracted from peginParams.ts so the borrow pre-flight (borrowParams.ts) reuses the identical
 * resolution + Sepolia client + Core-Spoke read rather than duplicating (and drifting from) it.
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

import { NETWORKS, type NetworkName } from "./config";

/** The immutable Core Spoke getter on the AaveIntegrationAdapter (read on-chain, never trusted from GraphQL). */
const CORE_SPOKE_FN = "BTC_VAULT_CORE_SPOKE";

/** The vault service root (holds .env / .env.local / .env.dev-testnet), relative to this file. */
const VAULT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Networks whose resolved env we've already surfaced, so we log it once per process (not per call). */
const loggedNetworks = new Set<NetworkName>();

export interface NetworkContracts {
  registry: Address;
  /** AaveIntegrationAdapter (app controller) — NEXT_PUBLIC_TBV_AAVE_ADAPTER. Also the Core-Spoke source. */
  appController: string;
  graphqlEndpoint: string;
  ethRpcUrl: string;
  /** AaveAdapterConfig — holds the per-position size params (maxVaultsPerPosition). */
  aaveAdapterConfig: Address;
}

/**
 * Resolve the network's contract addresses + endpoints from the app's env, exactly as the running
 * dapp does — so a `sync-env.mjs` rotation is picked up automatically instead of going stale.
 */
export function resolveNetworkContracts(
  network: NetworkName,
): NetworkContracts {
  const env = loadEnv(NETWORKS[network].viteMode, VAULT_ROOT, "NEXT_PUBLIC_");
  const registry = env.NEXT_PUBLIC_TBV_BTC_VAULT_REGISTRY;
  const appController = env.NEXT_PUBLIC_TBV_AAVE_ADAPTER;
  const graphqlEndpoint = env.NEXT_PUBLIC_TBV_GRAPHQL_ENDPOINT;
  const ethRpcUrl = env.NEXT_PUBLIC_ETH_RPC_URL;
  const aaveAdapterConfig = env.NEXT_PUBLIC_TBV_AAVE_ADAPTER_CONFIG;
  if (
    !registry ||
    !appController ||
    !graphqlEndpoint ||
    !ethRpcUrl ||
    !aaveAdapterConfig
  )
    throw new Error(
      `Missing NEXT_PUBLIC_TBV_* env for ${network} (Vite mode "${NETWORKS[network].viteMode}", dir ${VAULT_ROOT}). Run 'pnpm --filter vault sync-env' or check .env / .env.dev-testnet.`,
    );

  // Surface which network's values were resolved (once per process), and warn loudly if they look
  // like they came from another network — `loadEnv` merges shared `.env` under the mode file, so a key
  // missing from `.env.<mode>` would silently inherit e.g. devnet's value. The endpoint host naming
  // (…vault-devnet… / …testnet…) is a cheap cross-check for that footgun.
  if (!loggedNetworks.has(network)) {
    loggedNetworks.add(network);
    // eslint-disable-next-line no-console
    console.log(
      `[network-contracts] ${network}: registry ${registry}, graphql ${graphqlEndpoint}`,
    );
    if (!graphqlEndpoint.includes(network))
      // eslint-disable-next-line no-console
      console.warn(
        `[network-contracts] ⚠️ ${network}: GraphQL endpoint "${graphqlEndpoint}" does not mention "${network}" — env may be resolving another network's values (a key missing from .env.${NETWORKS[network].viteMode}?).`,
      );
  }

  return {
    registry: registry as Address,
    appController,
    graphqlEndpoint,
    ethRpcUrl,
    aaveAdapterConfig: aaveAdapterConfig as Address,
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
