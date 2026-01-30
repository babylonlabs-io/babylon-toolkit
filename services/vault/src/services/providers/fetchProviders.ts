import { gql } from "graphql-request";

import { graphqlClient } from "../../clients/graphql";
import type {
  AppProvidersResponse,
  UniversalChallenger,
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

/** GraphQL response for versioned keepers/challengers query */
interface VersionedKeepersChallengersResponse {
  vaultKeeperApplications: {
    items: Array<{
      vaultKeeper: string;
      version: number;
      vaultKeeperInfo: {
        btcPubKey: string;
      };
    }>;
  };
  universalChallengerVersions: {
    items: Array<{
      version: number;
      challengerInfo: {
        id: string;
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

/**
 * GraphQL query to fetch vault keepers and universal challengers by version.
 * Used for payout signing where we need the keepers/challengers that were
 * active when the vault was created.
 */
const GET_KEEPERS_CHALLENGERS_BY_VERSION = gql`
  query GetKeepersAndChallengersByVersion(
    $appController: String!
    $keepersVersion: Int!
    $challengersVersion: Int!
  ) {
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
    universalChallengerVersions(where: { version_lte: $challengersVersion }) {
      items {
        version
        challengerInfo {
          id
          btcPubKey
        }
      }
    }
  }
`;

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

/**
 * @deprecated Use fetchAppProviders() for per-app data and get UCs from ProtocolParamsContext
 */
export const fetchProviders = fetchAppProviders;

/**
 * @deprecated Use fetchAppProviders() for per-app data and get UCs from ProtocolParamsContext
 */
export const fetchActiveProviders = fetchAppProviders;

/** Response from fetchKeepersAndChallengersByVersion */
export interface VersionedKeepersChallengersResult {
  vaultKeepers: VaultKeeper[];
  universalChallengers: UniversalChallenger[];
}

/**
 * Fetches vault keepers and universal challengers that were active at specific versions.
 * Used for payout signing where we need the keepers/challengers that were
 * locked when the vault was created.
 *
 * @param applicationController - The application controller address
 * @param appVaultKeepersVersion - The vault keepers version locked at vault creation
 * @param universalChallengersVersion - The universal challengers version locked at vault creation
 * @returns Object containing vaultKeepers and universalChallengers for those versions
 */
export async function fetchKeepersAndChallengersByVersion(
  applicationController: string,
  appVaultKeepersVersion: number,
  universalChallengersVersion: number,
): Promise<VersionedKeepersChallengersResult> {
  const response =
    await graphqlClient.request<VersionedKeepersChallengersResponse>(
      GET_KEEPERS_CHALLENGERS_BY_VERSION,
      {
        appController: applicationController.toLowerCase(),
        keepersVersion: appVaultKeepersVersion,
        challengersVersion: universalChallengersVersion,
      },
    );

  // Extract vault keepers with btcPubKey from nested relation
  const vaultKeepers: VaultKeeper[] =
    response.vaultKeeperApplications.items.map((item) => ({
      id: item.vaultKeeper,
      btcPubKey: item.vaultKeeperInfo.btcPubKey,
    }));

  // Extract universal challengers
  const universalChallengers: UniversalChallenger[] =
    response.universalChallengerVersions.items.map((item) => ({
      id: item.challengerInfo.id,
      btcPubKey: item.challengerInfo.btcPubKey,
    }));

  return {
    vaultKeepers,
    universalChallengers,
  };
}
