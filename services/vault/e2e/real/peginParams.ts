/**
 * Pegin-parameter pre-flight: fetch the protocol minimum deposit + the vault-provider list for the
 * selected network — the SAME sources the web app uses — so the CLI can offer them as defaults
 * (minimum amount, first provider) before launching the browser, network-scoped (devnet vs testnet).
 *
 *  - Minimum deposit: the ProtocolParams contract, read via the SDK's `ViemProtocolParamsReader`
 *    (addresses resolved off the network's BTCVaultRegistry) — identical to the app's
 *    `getPegInConfiguration().minimumPegInAmount`. Reused (not reimplemented) so it can't drift.
 *  - Providers: the indexer GraphQL `GetAppProviders` query, filtered by the app controller.
 *
 * The contract addresses + endpoints are NOT hardcoded — they rotate (via `scripts/sync-env.mjs`) and
 * differ per network. We resolve them exactly as the app does at runtime: Vite's `loadEnv` for the
 * network's mode (devnet ⇒ `development`, testnet ⇒ `dev-testnet`), which layers `.env` (sync-env's
 * output) + `.env.local` + `.env.<mode>` with the same precedence Vite gives the running dapp.
 */
import {
  resolveProtocolAddresses,
  ViemProtocolParamsReader,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { gql, GraphQLClient } from "graphql-request";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, http, type Address } from "viem";
import { sepolia } from "viem/chains";
import { loadEnv } from "vite";

import { NETWORKS, type NetworkName } from "./config";

const SATS_PER_BTC = 100_000_000n;

/** The vault service root (holds .env / .env.local / .env.dev-testnet), relative to this file. */
const VAULT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** A vault provider as offered in the CLI menu. `available` mirrors the app's metadata gating. */
export interface ProviderChoice {
  id: string;
  name: string;
  available: boolean;
}

interface NetworkContracts {
  registry: Address;
  appController: string;
  graphqlEndpoint: string;
  ethRpcUrl: string;
}

/**
 * Resolve the network's contract addresses + endpoints from the app's env, exactly as the running
 * dapp does — so a `sync-env.mjs` rotation is picked up automatically instead of going stale.
 */
function resolveNetworkContracts(network: NetworkName): NetworkContracts {
  const env = loadEnv(NETWORKS[network].viteMode, VAULT_ROOT, "NEXT_PUBLIC_");
  const registry = env.NEXT_PUBLIC_TBV_BTC_VAULT_REGISTRY;
  const appController = env.NEXT_PUBLIC_TBV_AAVE_ADAPTER;
  const graphqlEndpoint = env.NEXT_PUBLIC_TBV_GRAPHQL_ENDPOINT;
  const ethRpcUrl = env.NEXT_PUBLIC_ETH_RPC_URL;
  if (!registry || !appController || !graphqlEndpoint || !ethRpcUrl)
    throw new Error(
      `Missing NEXT_PUBLIC_TBV_* env for ${network} (Vite mode "${NETWORKS[network].viteMode}", dir ${VAULT_ROOT}). Run 'pnpm --filter vault sync-env' or check .env / .env.dev-testnet.`,
    );
  return {
    registry: registry as Address,
    appController,
    graphqlEndpoint,
    ethRpcUrl,
  };
}

/** Format satoshis as a trimmed BTC decimal string (e.g. 1_000_000n → "0.01"), for the amount input. */
function satsToBtc(sats: bigint): string {
  const whole = sats / SATS_PER_BTC;
  const frac = sats % SATS_PER_BTC;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(8, "0").replace(/0+$/, "");
  return `${whole}.${fracStr}`;
}

/** Fetch the protocol minimum pegin amount for `network`, formatted as a BTC string. */
export async function fetchMinDepositBtc(
  network: NetworkName,
): Promise<string> {
  const { registry, ethRpcUrl } = resolveNetworkContracts(network);
  const client = createPublicClient({
    chain: sepolia,
    transport: http(ethRpcUrl),
  });
  const addresses = await resolveProtocolAddresses(client, registry);
  const reader = new ViemProtocolParamsReader(client, addresses.protocolParams);
  const config = await reader.getPegInConfiguration();
  return satsToBtc(config.minimumPegInAmount);
}

const GET_APP_PROVIDERS = gql`
  query GetAppProviders($appController: String!) {
    vaultProviders(where: { applicationEntryPoint: $appController }) {
      items {
        id
        name
        metadataStatus
      }
    }
  }
`;

interface AppProvidersResponse {
  vaultProviders: {
    items: { id: string; name: string | null; metadataStatus: string | null }[];
  };
}

/** Fetch the app's vault providers for `network` from the indexer GraphQL. */
export async function fetchProviders(
  network: NetworkName,
): Promise<ProviderChoice[]> {
  const { graphqlEndpoint, appController } = resolveNetworkContracts(network);
  const client = new GraphQLClient(graphqlEndpoint);
  const response = await client.request<AppProvidersResponse>(
    GET_APP_PROVIDERS,
    { appController },
  );
  return response.vaultProviders.items.map((p) => ({
    id: p.id,
    name: p.name ?? p.id,
    // The app treats a null / "ok" metadataStatus as usable and any other value (rejected) as not.
    available: p.metadataStatus == null || p.metadataStatus === "ok",
  }));
}
