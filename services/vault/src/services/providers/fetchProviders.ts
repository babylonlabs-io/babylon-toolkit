import { gql } from "graphql-request";

import { logger } from "@/infrastructure";
import { shortId, TELEMETRY_EVENT } from "@/infrastructure/telemetryEvents";

import { graphqlClient } from "../../clients/graphql";
import type {
  AppProvidersResponse,
  VaultKeeper,
  VaultKeeperItem,
  VaultProvider,
  VaultProviderMetadataStatus,
} from "../../types/vaultProvider";
import {
  BTC_PUBKEY_HEX_PATTERN,
  ETH_ADDRESS_PATTERN,
} from "../../utils/validation";

import {
  IncompleteRosterError,
  MAX_ROSTER_PAGES,
  parseRosterPage,
  ROSTER_PAGE_SIZE,
} from "./rosterPagination";

interface GraphQLPageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

interface GraphQLVaultKeeperItem {
  vaultKeeper: string;
  version: number;
  vaultKeeperInfo: {
    btcPubKey: string;
  };
}

interface GraphQLVaultProviderItem {
  id: string;
  btcPubKey: string;
  name: string | null;
  rpcUrl: string | null;
  metadataStatus: string | null;
  metadataRejectionReason: string | null;
}

/** GraphQL response for app-specific providers and keepers */
interface GraphQLAppProvidersResponse {
  vaultProviders: {
    items: GraphQLVaultProviderItem[];
  };
  vaultKeeperApplications: {
    items: GraphQLVaultKeeperItem[];
    pageInfo: GraphQLPageInfo;
  };
}

interface GraphQLAppProviderMetadataResponse {
  vaultProviders: {
    items: GraphQLVaultProviderItem[];
  };
}

interface GraphQLVaultKeepersPageResponse {
  vaultKeeperApplications: {
    items: GraphQLVaultKeeperItem[];
    pageInfo: GraphQLPageInfo;
  };
}

const GET_APP_PROVIDERS = gql`
  query GetAppProviders($appController: String!, $limit: Int!) {
    vaultProviders(where: { applicationEntryPoint: $appController }) {
      items {
        id
        btcPubKey
        name
        rpcUrl
        metadataStatus
        metadataRejectionReason
      }
    }
    vaultKeeperApplications(
      where: { applicationEntryPoint: $appController }
      limit: $limit
    ) {
      items {
        vaultKeeper
        version
        vaultKeeperInfo {
          btcPubKey
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const GET_APP_PROVIDER_METADATA = gql`
  query GetAppProviderMetadata($appController: String!) {
    vaultProviders(where: { applicationEntryPoint: $appController }) {
      items {
        id
        btcPubKey
        name
        rpcUrl
        metadataStatus
        metadataRejectionReason
      }
    }
  }
`;

const GET_APP_VAULT_KEEPERS_NEXT_PAGE = gql`
  query GetAppVaultKeepersNextPage(
    $appController: String!
    $limit: Int!
    $after: String!
  ) {
    vaultKeeperApplications(
      where: { applicationEntryPoint: $appController }
      limit: $limit
      after: $after
    ) {
      items {
        vaultKeeper
        version
        vaultKeeperInfo {
          btcPubKey
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const KNOWN_METADATA_STATUSES: ReadonlySet<VaultProviderMetadataStatus> =
  new Set([
    "ok",
    "missing",
    "invalid_url",
    "unsupported_scheme",
    "private_host",
    "ipv6_literal_unsupported",
  ]);

/**
 * Map an indexer-provided metadataStatus string to the typed union.
 * Unknown / null values fall back to "ok" so legacy rows (or temporary
 * indexer drift) don't accidentally hide working providers from the UI.
 */
function normalizeMetadataStatus(
  status: string | null | undefined,
): VaultProviderMetadataStatus {
  if (
    status != null &&
    KNOWN_METADATA_STATUSES.has(status as VaultProviderMetadataStatus)
  ) {
    return status as VaultProviderMetadataStatus;
  }
  return "ok";
}

/**
 * Validate critical fields on an app provider from GraphQL.
 * Returns null (with a warning) if validation fails.
 */
function validateAppProvider(
  item: GraphQLVaultProviderItem,
): typeof item | null {
  if (!ETH_ADDRESS_PATTERN.test(item.id)) {
    logger.warn(
      `[fetchAppProviders] Skipping provider with invalid id: "${String(item.id).slice(0, 20)}"`,
    );
    return null;
  }
  if (!BTC_PUBKEY_HEX_PATTERN.test(item.btcPubKey)) {
    logger.warn(
      `[fetchAppProviders] Skipping provider ${item.id}: invalid btcPubKey format`,
    );
    return null;
  }
  return item;
}

/**
 * Validate critical fields on a vault keeper item from GraphQL.
 * Returns null (with a warning) if validation fails.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isVaultKeeperItem(value: unknown): value is GraphQLVaultKeeperItem {
  if (!isRecord(value) || !isRecord(value.vaultKeeperInfo)) return false;

  return (
    typeof value.vaultKeeper === "string" &&
    ETH_ADDRESS_PATTERN.test(value.vaultKeeper) &&
    typeof value.version === "number" &&
    Number.isSafeInteger(value.version) &&
    value.version >= 0 &&
    typeof value.vaultKeeperInfo.btcPubKey === "string" &&
    BTC_PUBKEY_HEX_PATTERN.test(value.vaultKeeperInfo.btcPubKey)
  );
}

/**
 * Filters keeper items to the latest version and deduplicates.
 */
export function getLatestVersionKeepers(
  items: VaultKeeperItem[],
): VaultKeeper[] {
  if (items.length === 0) return [];

  const latestVersion = Math.max(...items.map((i) => i.version));
  const seen = new Set<string>();
  const result: VaultKeeper[] = [];

  for (const item of items) {
    if (item.version === latestVersion && !seen.has(item.id)) {
      seen.add(item.id);
      result.push({ id: item.id, btcPubKey: item.btcPubKey });
    }
  }

  return result;
}

/**
 * Applications (lowercased addresses) for which the all-rows-invalid event has
 * already been emitted this session. Module-scoped for the same reason as the
 * all-disabled gate in useVaultProviders: React Query polling re-runs
 * fetchAppProviders, and a persistent indexer regression must be reported
 * once per application — not once per refetch.
 */
const emittedAllInvalidFor = new Set<string>();

function toVaultProviders(
  rawProviders: GraphQLVaultProviderItem[],
  appKey: string,
): VaultProvider[] {
  const withRpcUrl = rawProviders.filter(
    (provider): provider is GraphQLVaultProviderItem & { rpcUrl: string } =>
      provider.rpcUrl !== null,
  );
  if (withRpcUrl.length < rawProviders.length) {
    logger.warn("Dropped vault providers with null rpcUrl from indexer", {
      dropped: rawProviders.length - withRpcUrl.length,
      total: rawProviders.length,
    });
  }

  const vaultProviders: VaultProvider[] = withRpcUrl
    .filter((provider) => validateAppProvider(provider) !== null)
    .map((provider) => ({
      id: provider.id,
      btcPubKey: provider.btcPubKey,
      name: provider.name ?? undefined,
      url: provider.rpcUrl,
      metadataStatus: normalizeMetadataStatus(provider.metadataStatus),
      metadataRejectionReason: provider.metadataRejectionReason ?? undefined,
    }));

  if (
    rawProviders.length > 0 &&
    vaultProviders.length === 0 &&
    !emittedAllInvalidFor.has(appKey)
  ) {
    emittedAllInvalidFor.add(appKey);
    logger.event(TELEMETRY_EVENT.ONBOARDING_PROVIDERS_EMPTY, {
      level: "warning",
      category: "onboarding",
      tags: { reason: "all_rows_invalid" },
      total: rawProviders.length,
      applicationId: shortId(appKey),
    });
  }

  return vaultProviders;
}

/** Fetch provider metadata without coupling it to keeper-roster completeness. */
export async function fetchAppProviderMetadata(
  applicationEntryPoint: string,
): Promise<AppProvidersResponse> {
  const appKey = applicationEntryPoint.toLowerCase();
  const response =
    await graphqlClient.request<GraphQLAppProviderMetadataResponse>(
      GET_APP_PROVIDER_METADATA,
      { appController: appKey },
    );

  return {
    vaultProviders: toVaultProviders(response.vaultProviders.items, appKey),
    vaultKeepers: [],
    vaultKeeperItems: [],
  };
}

/**
 * Fetches vault providers and vault keepers for a specific application.
 *
 * Note: Universal challengers are system-wide and should be fetched from
 * ProtocolParamsContext instead of per-application.
 *
 * Note: Logos are fetched separately via useLogos hook to avoid blocking
 * provider data on the logo API.
 *
 * @param applicationEntryPoint - The application controller address to filter by.
 * @returns Object containing vaultProviders and vaultKeepers arrays
 */
export async function fetchAppProviders(
  applicationEntryPoint: string,
): Promise<AppProvidersResponse> {
  const appKey = applicationEntryPoint.toLowerCase();
  const response = await graphqlClient.request<GraphQLAppProvidersResponse>(
    GET_APP_PROVIDERS,
    { appController: appKey, limit: ROSTER_PAGE_SIZE },
  );

  const firstKeeperPage = parseRosterPage<GraphQLVaultKeeperItem>(
    response,
    "vaultKeeperApplications",
    "[fetchAppProviders] First vault keeper page",
    isVaultKeeperItem,
  );
  const rawVaultKeeperItems = [...firstKeeperPage.items];
  let keeperPageInfo = firstKeeperPage.pageInfo;
  let keeperPagesFetched = 1;

  while (keeperPageInfo.hasNextPage) {
    if (!keeperPageInfo.endCursor) {
      throw new IncompleteRosterError(
        `[fetchAppProviders] Indexer reported another vault keeper page ` +
          `without a cursor after page ${keeperPagesFetched}; refusing to ` +
          `return an incomplete roster`,
      );
    }
    if (keeperPagesFetched >= MAX_ROSTER_PAGES) {
      throw new IncompleteRosterError(
        `[fetchAppProviders] Vault keeper roster exceeds ` +
          `${MAX_ROSTER_PAGES * ROSTER_PAGE_SIZE} rows; refusing to return ` +
          `an incomplete roster`,
      );
    }

    const nextPage =
      await graphqlClient.request<GraphQLVaultKeepersPageResponse>(
        GET_APP_VAULT_KEEPERS_NEXT_PAGE,
        {
          appController: appKey,
          limit: ROSTER_PAGE_SIZE,
          after: keeperPageInfo.endCursor,
        },
      );
    const parsedNextPage = parseRosterPage<GraphQLVaultKeeperItem>(
      nextPage,
      "vaultKeeperApplications",
      `[fetchAppProviders] Vault keeper page ${keeperPagesFetched + 1}`,
      isVaultKeeperItem,
    );
    rawVaultKeeperItems.push(...parsedNextPage.items);
    keeperPageInfo = parsedNextPage.pageInfo;
    keeperPagesFetched += 1;
  }

  const vaultProviders = toVaultProviders(
    response.vaultProviders.items,
    appKey,
  );

  const vaultKeeperItems: VaultKeeperItem[] = rawVaultKeeperItems.map(
    (item) => ({
      id: item.vaultKeeper,
      btcPubKey: item.vaultKeeperInfo.btcPubKey,
      version: item.version,
    }),
  );

  return {
    vaultProviders,
    vaultKeepers: getLatestVersionKeepers(vaultKeeperItems),
    vaultKeeperItems,
  };
}
