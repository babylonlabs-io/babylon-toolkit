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
import {
  AaveIntegrationAdapterABI,
  BPS_SCALE,
  computeMinDepositForSplit,
  computeSeizedFraction,
  getDynamicReserveConfig,
  getReserve,
  getTargetHealthFactor,
  wadToNumber,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
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

const SATS_PER_BTC = 100_000_000n;

// Two-vault split risk constants — mirror `services/vault/src/applications/aave/constants.ts`
// (EXPECTED_HEALTH_FACTOR_AT_LIQUIDATION, VAULT_SPLIT_SAFETY_MARGIN). They feed the SDK split math
// exactly as the app's `useOptimalSplit` does, so the fetched split minimum matches the form.
const EXPECTED_HEALTH_FACTOR_AT_LIQUIDATION = 0.95;
const VAULT_SPLIT_SAFETY_MARGIN = 1.05;
/** The immutable Core Spoke getter on the AaveIntegrationAdapter (read on-chain, never trusted from GraphQL). */
const CORE_SPOKE_FN = "BTC_VAULT_CORE_SPOKE";

/** The vault service root (holds .env / .env.local / .env.dev-testnet), relative to this file. */
const VAULT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Networks whose resolved env we've already surfaced, so we log it once per process (not per call). */
const loggedNetworks = new Set<NetworkName>();

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

  // Surface which network's values were resolved (once per process), and warn loudly if they look
  // like they came from another network — `loadEnv` merges shared `.env` under the mode file, so a key
  // missing from `.env.<mode>` would silently inherit e.g. devnet's value. The endpoint host naming
  // (…vault-devnet… / …testnet…) is a cheap cross-check for that footgun.
  if (!loggedNetworks.has(network)) {
    loggedNetworks.add(network);
    // eslint-disable-next-line no-console
    console.log(
      `[pegin-params] ${network}: registry ${registry}, graphql ${graphqlEndpoint}`,
    );
    if (!graphqlEndpoint.includes(network))
      // eslint-disable-next-line no-console
      console.warn(
        `[pegin-params] ⚠️ ${network}: GraphQL endpoint "${graphqlEndpoint}" does not mention "${network}" — env may be resolving another network's values (a key missing from .env.${NETWORKS[network].viteMode}?).`,
      );
  }

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

/** A Sepolia public client for the network's ETH RPC (the same reads the app performs). */
function createEthClient(ethRpcUrl: string): PublicClient {
  return createPublicClient({
    chain: sepolia,
    transport: http(ethRpcUrl),
  }) as PublicClient;
}

/**
 * Read the peg-in configuration from the ProtocolParams contract via the SDK reader (addresses
 * resolved off the network's BTCVaultRegistry) — identical to the app's `getPegInConfiguration()`.
 * Shared by the single-vault minimum and the two-vault split minimum so neither can drift.
 */
async function getPegInConfig(client: PublicClient, registry: Address) {
  const addresses = await resolveProtocolAddresses(client, registry);
  const reader = new ViemProtocolParamsReader(client, addresses.protocolParams);
  return reader.getPegInConfiguration();
}

/** Fetch the protocol minimum pegin amount for `network`, formatted as a BTC string. */
export async function fetchMinDepositBtc(
  network: NetworkName,
): Promise<string> {
  const { registry, ethRpcUrl } = resolveNetworkContracts(network);
  const client = createEthClient(ethRpcUrl);
  const config = await getPegInConfig(client, registry);
  return satsToBtc(config.minimumPegInAmount);
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
 * Fetch the minimum deposit required to enable a TWO-VAULT split for `network`, formatted as a BTC
 * string — the same value the deposit form shows in its "increase your deposit to at least X sBTC"
 * hint. This is NOT a plain protocol param: it mirrors the app's `useOptimalSplit` / `useVaultSplitParams`
 * chain — `minPegin` from ProtocolParams, plus the Aave Core Spoke risk params (THF/CF/LB) — fed through
 * the SDK's `computeSeizedFraction` + `computeMinDepositForSplit` (the frozen split math is NOT
 * reimplemented). It uses the reserve's current `dynamicConfigKey` (the no-position baseline), so a
 * depositor with an existing position opened under a since-rotated config may see a slightly different
 * threshold. Treat the result as a best-effort ESTIMATE for defaults/warnings — NEVER a hard gate: the
 * live deposit form (read by the pegin action's split selector) is the authoritative, position-aware
 * minimum and is what actually blocks a too-low split.
 */
export async function fetchMinDepositForSplitBtc(
  network: NetworkName,
): Promise<string> {
  const { registry, appController, graphqlEndpoint, ethRpcUrl } =
    resolveNetworkContracts(network);
  const client = createEthClient(ethRpcUrl);

  // Single-vault minimum (minPegin) — the same read fetchMinDepositBtc uses.
  const peginConfig = await getPegInConfig(client, registry);
  const minPegin = peginConfig.minimumPegInAmount;

  // Resolve the Core Spoke on-chain from the env-pinned adapter (mirrors the app's getCoreSpokeAddress —
  // never trust a GraphQL-supplied spoke), and the vBTC reserve id from the indexer's singleton config.
  const spokeAddress = (await client.readContract({
    address: appController as Address,
    abi: AaveIntegrationAdapterABI,
    functionName: CORE_SPOKE_FN,
    args: [],
  })) as Address;

  const gqlClient = new GraphQLClient(graphqlEndpoint);
  const { aaveConfig } =
    await gqlClient.request<VbtcReserveIdResponse>(GET_VBTC_RESERVE_ID);
  if (!aaveConfig)
    throw new Error(
      `No aaveConfig from the indexer at ${graphqlEndpoint} — cannot resolve the vBTC reserve id for the split minimum.`,
    );
  const reserveId = BigInt(aaveConfig.vaultBtcReserveId);

  // Aave risk params from the spoke, using the reserve's current dynamicConfigKey (no-position baseline).
  const { dynamicConfigKey } = await getReserve(
    client,
    spokeAddress,
    reserveId,
  );
  const [thfWad, dynamicConfig] = await Promise.all([
    getTargetHealthFactor(client, spokeAddress),
    getDynamicReserveConfig(client, spokeAddress, reserveId, dynamicConfigKey),
  ]);
  const THF = wadToNumber(thfWad);
  const CF = Number(dynamicConfig.collateralFactor) / BPS_SCALE;
  const LB = Number(dynamicConfig.maxLiquidationBonus) / BPS_SCALE;

  // SDK split math, identical to useOptimalSplit: seized fraction → minimum deposit for a split.
  const seizedFraction = computeSeizedFraction(
    CF,
    LB,
    THF,
    EXPECTED_HEALTH_FACTOR_AT_LIQUIDATION,
  );
  const minSplitSats = computeMinDepositForSplit({
    minPegin,
    seizedFraction,
    safetyMargin: VAULT_SPLIT_SAFETY_MARGIN,
  });
  if (minSplitSats <= 0n)
    throw new Error(
      `Computed split minimum is ${minSplitSats} sats (seizedFraction ${seizedFraction}, CF ${CF}, LB ${LB}, THF ${THF}) — two-vault split is not available for this reserve.`,
    );
  return satsToBtc(minSplitSats);
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
