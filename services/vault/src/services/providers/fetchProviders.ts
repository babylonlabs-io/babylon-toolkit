import { gql } from "graphql-request";

import { graphqlClient } from "../../clients/graphql";
import { fetchLogos } from "../../clients/logo";
import type {
  AppProvidersResponse,
  VaultKeeper,
  VaultKeeperItem,
  VaultProvider,
} from "../../types/vaultProvider";

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

/** GraphQL response for versioned keepers-only query */
interface VersionedKeepersResponse {
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
    vaultProviders(where: { applicationController: $appController }) {
      items {
        id
        btcPubKey
        name
        rpcUrl
      }
    }
    vaultKeeperApplications(where: { applicationController: $appController }) {
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

/** GraphQL query to fetch vault keepers by exact version */
const GET_KEEPERS_BY_VERSION = gql`
  query GetKeepersByVersion($appController: String!, $keepersVersion: Int!) {
    vaultKeeperApplications(
      where: { applicationController: $appController, version: $keepersVersion }
    ) {
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
 * Fetches vault keepers by version for a specific application.
 * Used for payout signing where we need the keepers that were locked
 * when the vault was created.
 *
 * @param applicationController - The application controller address
 * @param appVaultKeepersVersion - The vault keepers version locked at vault creation
 * @returns Array of vault keepers for that version
 */
export async function fetchVaultKeepersByVersion(
  applicationController: string,
  appVaultKeepersVersion: number,
): Promise<VaultKeeper[]> {
  const response = await graphqlClient.request<VersionedKeepersResponse>(
    GET_KEEPERS_BY_VERSION,
    {
      appController: applicationController.toLowerCase(),
      keepersVersion: appVaultKeepersVersion,
    },
  );

  return response.vaultKeeperApplications.items.map((item) => ({
    id: item.vaultKeeper,
    btcPubKey: item.vaultKeeperInfo.btcPubKey,
  }));
}

/**
 * Normalizes a BTC public key to the identity format expected by the sidecar logo API.
 * Strips the "0x" prefix when present so the key matches the format used by the /logo endpoint.
 *
 * @param btcPubKey - BTC public key, possibly with a "0x" prefix (e.g. from GraphQL).
 * @returns Identity string without "0x" prefix.
 */
function toIdentity(btcPubKey: string): string {
  return btcPubKey.startsWith("0x") ? btcPubKey.slice(2) : btcPubKey;
}

/**
 * Fetches vault providers and vault keepers for a specific application.
 *
 * Note: Universal challengers are system-wide and should be fetched from
 * ProtocolParamsContext instead of per-application.
 *
 * @param applicationController - The application controller address to filter by.
 * @returns Object containing vaultProviders and vaultKeepers arrays
 */
export async function fetchAppProviders(
  applicationController: string,
): Promise<AppProvidersResponse> {
  const response = await graphqlClient.request<GraphQLAppProvidersResponse>(
    GET_APP_PROVIDERS,
    { appController: applicationController.toLowerCase() },
  );

  const providersWithRpc = response.vaultProviders.items.filter(
    (provider): provider is typeof provider & { rpcUrl: string } =>
      provider.rpcUrl !== null,
  );

  const providersWithIdentity = providersWithRpc.map((provider) => ({
    provider,
    identity: toIdentity(provider.btcPubKey),
  }));
  const logos = await fetchLogos(
    providersWithIdentity.map(({ identity }) => identity),
  );

  const vaultProviders: VaultProvider[] = providersWithIdentity.map(
    ({ provider, identity }) => ({
      id: provider.id,
      btcPubKey: provider.btcPubKey,
      url: provider.rpcUrl,
      iconUrl: logos[identity],
    }),
  );

  const vaultKeeperItems: VaultKeeperItem[] =
    response.vaultKeeperApplications.items.map((item) => ({
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
