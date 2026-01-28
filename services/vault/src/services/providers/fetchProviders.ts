import { gql } from "graphql-request";

import { graphqlClient } from "../../clients/graphql";
import type {
  ProvidersResponse,
  UniversalChallenger,
  VaultKeeper,
  VaultProvider,
} from "../../types/vaultProvider";

/** GraphQL response shape for vault providers, vault keepers, and universal challengers */
interface GraphQLProvidersResponse {
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

const GET_PROVIDERS_AND_KEEPERS = gql`
  query GetProvidersAndKeepers($appController: String!) {
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
    universalChallengerVersions {
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
 * Fetches vault providers, vault keepers, and universal challengers for a specific application.
 *
 * Uses a single GraphQL query to fetch:
 * - Vault providers (per-application)
 * - Vault keepers (per-application)
 * - Universal challengers (system-wide)
 *
 * @param applicationController - The application controller address to filter by.
 * @returns Object containing vaultProviders, vaultKeepers, and universalChallengers arrays
 */
export async function fetchProviders(
  applicationController: string,
): Promise<ProvidersResponse> {
  const response = await graphqlClient.request<GraphQLProvidersResponse>(
    GET_PROVIDERS_AND_KEEPERS,
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

  // Extract universal challengers (system-wide)
  const universalChallengers: UniversalChallenger[] =
    response.universalChallengerVersions.items.map((item) => ({
      id: item.challengerInfo.id,
      btcPubKey: item.challengerInfo.btcPubKey,
    }));

  return {
    vaultProviders,
    vaultKeepers,
    universalChallengers,
  };
}

/**
 * Fetches only active vault providers along with vault keepers and universal challengers.
 *
 * Note: All providers are immediately active upon registration, so this is equivalent
 * to fetchProviders(). Kept for backwards compatibility.
 *
 * @param applicationController - The application controller address to filter by.
 * @returns Object containing vaultProviders, vaultKeepers, and universalChallengers
 */
export async function fetchActiveProviders(
  applicationController: string,
): Promise<ProvidersResponse> {
  // All providers are immediately active upon registration (no pending state)
  return fetchProviders(applicationController);
}

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
