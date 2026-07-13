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
 * Contract addresses + endpoints are resolved per-network from the app's env via `networkContracts.ts`
 * (shared with the borrow pre-flight) — never hardcoded, so a `sync-env.mjs` rotation is picked up.
 */
import {
  resolveProtocolAddresses,
  ViemProtocolParamsReader,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import {
  BPS_SCALE,
  computeMinDepositForSplit,
  computeSeizedFraction,
  getDynamicReserveConfig,
  getPositionSizeParams,
  getReserve,
  getTargetHealthFactor,
  wadToNumber,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import { gql } from "graphql-request";
import { type Address, type PublicClient } from "viem";

import { type NetworkName } from "./config";
import {
  createEthClient,
  createGraphQLClient,
  fetchVbtcReserveId,
  resolveCoreSpoke,
  resolveNetworkContracts,
} from "./networkContracts";

const SATS_PER_BTC = 100_000_000n;
/** BTC has 8 decimal places (1 BTC = 1e8 sats) — the fractional width for the amount string. */
const BTC_DECIMALS = 8;

// Two-vault split risk constants — mirror `services/vault/src/applications/aave/constants.ts`
// (EXPECTED_HEALTH_FACTOR_AT_LIQUIDATION, VAULT_SPLIT_SAFETY_MARGIN). They feed the SDK split math
// exactly as the app's `useOptimalSplit` does, so the fetched split minimum matches the form.
const EXPECTED_HEALTH_FACTOR_AT_LIQUIDATION = 0.95;
const VAULT_SPLIT_SAFETY_MARGIN = 1.05;

/** A vault provider as offered in the CLI menu. `available` mirrors the app's metadata gating. */
export interface ProviderChoice {
  id: string;
  name: string;
  available: boolean;
}

/** Format satoshis as a trimmed BTC decimal string (e.g. 1_000_000n → "0.01"), for the amount input. */
function satsToBtc(sats: bigint): string {
  const whole = sats / SATS_PER_BTC;
  const frac = sats % SATS_PER_BTC;
  if (frac === 0n) return whole.toString();
  const fracStr = frac
    .toString()
    .padStart(BTC_DECIMALS, "0")
    .replace(/0+$/, "");
  return `${whole}.${fracStr}`;
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
  const spokeAddress = await resolveCoreSpoke(client, appController);
  const reserveId = await fetchVbtcReserveId(graphqlEndpoint);

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
  const client = createGraphQLClient(graphqlEndpoint);
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

/**
 * Raw indexer vault statuses that occupy a per-position cap slot — the raw-string equivalent of the
 * app's `countCollateralizableVaults` (ContractStatus ACTIVE|PENDING|VERIFIED): "available" → ACTIVE,
 * "pending"/"signatures_collected" → PENDING, "verified" → VERIFIED. Terminal states (redeemed,
 * liquidated, expired, invalid, depositor_withdrawn) free the slot and are NOT counted. Kept as raw
 * strings so we count off the indexer directly without importing the app's status enums.
 */
const CAP_SLOT_STATUSES = new Set([
  "available",
  "pending",
  "signatures_collected",
  "verified",
]);
/** Ponder's max page size + a runaway-cursor backstop, mirroring the app's fetchVaultsByDepositor. */
const VAULTS_PAGE_SIZE = 1000;
const MAX_VAULT_PAGES = 50;

const GET_DEPOSITOR_VAULT_STATUSES_FIRST = gql`
  query GetDepositorVaultStatusesFirst($depositor: String!, $limit: Int!) {
    vaults(where: { depositor: $depositor }, limit: $limit) {
      items {
        status
        applicationEntryPoint
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const GET_DEPOSITOR_VAULT_STATUSES_NEXT = gql`
  query GetDepositorVaultStatusesNext(
    $depositor: String!
    $limit: Int!
    $after: String!
  ) {
    vaults(where: { depositor: $depositor }, limit: $limit, after: $after) {
      items {
        status
        applicationEntryPoint
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

interface VaultStatusPage {
  vaults: {
    items: { status: string; applicationEntryPoint: string }[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
}

export interface VaultCountCap {
  /** On-chain per-position BTC Vault cap. 0 means unlimited (the adapter only enforces a cap > 0). */
  maxVaults: number;
  /** This depositor's vaults under the app that currently occupy a cap slot. */
  currentCount: number;
}

/**
 * Read the per-position BTC-Vault cap and the depositor's current occupied-slot count, mirroring the
 * app's `useVaultCountCap`: the cap from `getPositionSizeParams(AaveAdapterConfig).maxVaultsPerPosition`
 * (on-chain), and the count from the indexer — this depositor's vaults filtered to the collateralizable
 * statuses under this app's controller (a conservative superset that includes in-flight PENDING/VERIFIED,
 * so it over-counts rather than under-counts, matching the app). Paginated like the app so a high-volume
 * depositor isn't silently truncated.
 */
export async function fetchVaultCountCap(
  network: NetworkName,
  depositorEthAddress: string,
): Promise<VaultCountCap> {
  const { appController, graphqlEndpoint, ethRpcUrl, aaveAdapterConfig } =
    resolveNetworkContracts(network);

  const client = createEthClient(ethRpcUrl);
  const { maxVaultsPerPosition } = await getPositionSizeParams(
    client,
    aaveAdapterConfig,
  );
  const maxVaults = Number(maxVaultsPerPosition);

  const gqlClient = createGraphQLClient(graphqlEndpoint);
  const depositor = depositorEthAddress.toLowerCase();
  const adapter = appController.toLowerCase();
  let currentCount = 0;
  let after: string | null = null;
  for (let pageIndex = 0; pageIndex < MAX_VAULT_PAGES; pageIndex++) {
    const page: VaultStatusPage = after
      ? await gqlClient.request(GET_DEPOSITOR_VAULT_STATUSES_NEXT, {
          depositor,
          limit: VAULTS_PAGE_SIZE,
          after,
        })
      : await gqlClient.request(GET_DEPOSITOR_VAULT_STATUSES_FIRST, {
          depositor,
          limit: VAULTS_PAGE_SIZE,
        });
    for (const item of page.vaults.items)
      if (
        CAP_SLOT_STATUSES.has(item.status) &&
        item.applicationEntryPoint.toLowerCase() === adapter
      )
        currentCount++;
    if (!page.vaults.pageInfo.hasNextPage) break;
    after = page.vaults.pageInfo.endCursor;
    if (!after) break;
  }

  return { maxVaults, currentCount };
}
