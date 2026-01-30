import { gql } from "graphql-request";

import { graphqlClient } from "../../clients/graphql";
import type {
  AppProvidersResponse,
  VaultKeeper,
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

/** GraphQL query to fetch vault keepers by version */
const GET_KEEPERS_BY_VERSION = gql`
  query GetKeepersByVersion($appController: String!, $keepersVersion: Int!) {
    vaultKeeperApplications(
      where: {
        applicationController: $appController
        version_lte: $keepersVersion
      }
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

  const vaultProviders: VaultProvider[] = response.vaultProviders.items
    .filter(
      (provider): provider is typeof provider & { rpcUrl: string } =>
        provider.rpcUrl !== null,
    )
    .map((provider) => ({
      id: provider.id,
      btcPubKey: provider.btcPubKey,
      url: provider.rpcUrl,
    }));

  // Extract vault keepers with btcPubKey from nested relation
  const vaultKeepers: VaultKeeper[] =
    response.vaultKeeperApplications.items.map((item) => ({
      id: item.vaultKeeper,
      btcPubKey: item.vaultKeeperInfo.btcPubKey,
    }));

  return {
    vaultProviders,
    vaultKeepers,
  };
}
