import { gql } from "graphql-request";

import { logger } from "@/infrastructure";

import { graphqlClient } from "../../clients/graphql";
import type {
  AppProvidersResponse,
  VaultKeeper,
  VaultKeeperItem,
  VaultProvider,
} from "../../types/vaultProvider";
import {
  BTC_PUBKEY_HEX_PATTERN,
  ETH_ADDRESS_PATTERN,
} from "../../utils/validation";

/** GraphQL response for app-specific providers and keepers */
interface GraphQLAppProvidersResponse {
  vaultProviders: {
    items: Array<{
      id: string;
      btcPubKey: string;
      name: string | null;
      rpcUrl: string | null;
    }>;
  };
  vaultKeeperApplications: {
    items: Array<{
      vaultKeeper: string;
      version: number;
      vaultKeeperInfo: {
        btcPubKey: string;
      };
    }>;
  };
}

const GET_APP_PROVIDERS = gql`
  query GetAppProviders($appController: String!) {
    vaultProviders(where: { applicationEntryPoint: $appController }) {
      items {
        id
        btcPubKey
        name
        rpcUrl
      }
    }
    vaultKeeperApplications(where: { applicationEntryPoint: $appController }) {
      items {
        vaultKeeper
        version
        vaultKeeperInfo {
          btcPubKey
        }
      }
    }
  }
`;

/**
 * Validate critical fields on an app provider from GraphQL.
 * Returns null (with a warning) if validation fails.
 */
function validateAppProvider(
  item: GraphQLAppProvidersResponse["vaultProviders"]["items"][number],
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
function validateVaultKeeperItem(
  item: GraphQLAppProvidersResponse["vaultKeeperApplications"]["items"][number],
): typeof item | null {
  if (!ETH_ADDRESS_PATTERN.test(item.vaultKeeper)) {
    logger.warn(
      `[fetchAppProviders] Skipping keeper with invalid id: "${String(item.vaultKeeper).slice(0, 20)}"`,
    );
    return null;
  }
  if (!BTC_PUBKEY_HEX_PATTERN.test(item.vaultKeeperInfo.btcPubKey)) {
    logger.warn(
      `[fetchAppProviders] Skipping keeper ${item.vaultKeeper}: invalid btcPubKey format`,
    );
    return null;
  }
  return item;
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
  const response = await graphqlClient.request<GraphQLAppProvidersResponse>(
    GET_APP_PROVIDERS,
    { appController: applicationEntryPoint.toLowerCase() },
  );

  const vaultProviders: VaultProvider[] = response.vaultProviders.items
    .filter(
      (provider): provider is typeof provider & { rpcUrl: string } =>
        provider.rpcUrl !== null,
    )
    .filter((provider) => validateAppProvider(provider) !== null)
    .map((provider) => ({
      id: provider.id,
      btcPubKey: provider.btcPubKey,
      name: provider.name ?? undefined,
      url: provider.rpcUrl,
    }));

  const vaultKeeperItems: VaultKeeperItem[] =
    response.vaultKeeperApplications.items
      .filter((item) => validateVaultKeeperItem(item) !== null)
      .map((item) => ({
        id: item.vaultKeeper,
        btcPubKey: item.vaultKeeperInfo.btcPubKey,
        version: item.version,
      }));

  return {
    vaultProviders,
    vaultKeepers: getLatestVersionKeepers(vaultKeeperItems),
    vaultKeeperItems,
  };
}
