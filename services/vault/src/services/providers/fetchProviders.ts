import { gql } from "graphql-request";

import { graphqlClient } from "../../clients/graphql";
import { getVaultProviderMetadata } from "../../registry";
import type {
  Liquidator,
  ProvidersResponse,
  VaultProvider,
} from "../../types/vaultProvider";

/** GraphQL response shape for vault providers and liquidators query */
interface GraphQLProvidersResponse {
  vaultProviders: {
    items: Array<{
      id: string;
      btcPubKey: string;
      status: string;
    }>;
  };
  liquidatorApplications: {
    items: Array<{
      liquidator: string;
      liquidatorInfo: {
        btcPubKey: string;
      };
    }>;
  };
}

const GET_PROVIDERS_AND_LIQUIDATORS = gql`
  query GetProvidersAndLiquidators($appController: String!) {
    vaultProviders(where: { applicationController: $appController }) {
      items {
        id
        btcPubKey
        status
      }
    }
    liquidatorApplications(where: { applicationController: $appController }) {
      items {
        liquidator
        liquidatorInfo {
          btcPubKey
        }
      }
    }
  }
`;

/**
 * Fetches vault providers and liquidators for a specific application.
 *
 * Uses a single GraphQL query with nested relation to fetch both vault providers
 * and liquidators (with their BTC public keys) in one request.
 *
 * @param applicationController - The application controller address to filter by.
 * @returns Object containing vaultProviders and liquidators arrays
 */
export async function fetchProviders(
  applicationController: string,
): Promise<ProvidersResponse> {
  const response = await graphqlClient.request<GraphQLProvidersResponse>(
    GET_PROVIDERS_AND_LIQUIDATORS,
    { appController: applicationController.toLowerCase() },
  );

  // Transform vault providers with metadata from registry
  const vaultProviders: VaultProvider[] = response.vaultProviders.items.map(
    (provider) => {
      const metadata = getVaultProviderMetadata(provider.id);

      return {
        id: provider.id,
        btcPubKey: provider.btcPubKey,
        status: provider.status,
        url: metadata.url,
      };
    },
  );

  // Extract liquidators with btcPubKey from nested relation
  const liquidators: Liquidator[] = response.liquidatorApplications.items.map(
    (item) => ({
      id: item.liquidator,
      btcPubKey: item.liquidatorInfo.btcPubKey,
    }),
  );

  return {
    vaultProviders,
    liquidators,
  };
}

/**
 * Fetches only active vault providers and liquidators for a specific application.
 *
 * @param applicationController - The application controller address to filter by.
 * @returns Object containing active vaultProviders and liquidators arrays
 */
export async function fetchActiveProviders(
  applicationController: string,
): Promise<ProvidersResponse> {
  const { vaultProviders, liquidators } = await fetchProviders(
    applicationController,
  );

  return {
    vaultProviders: vaultProviders.filter(
      (provider) => provider.status === "active",
    ),
    liquidators,
  };
}
