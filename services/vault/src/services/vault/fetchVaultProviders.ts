/**
 * Fetch vault providers via GraphQL
 *
 * Plain JS function for fetching vault provider data that can be used
 * in both React hooks and Node.js environments.
 */

import { gql } from "graphql-request";

import { graphqlClient } from "../../clients/graphql/client";

const GET_VAULT_PROVIDERS = gql`
  query GetVaultProviders {
    vaultProviders {
      items {
        id
        btcPubKey
        applicationController
        depositAmount
        status
        registeredAt
        activatedAt
        blockNumber
        transactionHash
      }
    }
  }
`;

const GET_VAULT_PROVIDER_BY_ID = gql`
  query GetVaultProviderById($id: String!) {
    vaultProvider(id: $id) {
      id
      btcPubKey
      applicationController
      depositAmount
      status
      registeredAt
      activatedAt
      blockNumber
      transactionHash
    }
  }
`;

/**
 * Vault provider data shape
 */
export interface VaultProvider {
  id: string;
  btcPubKey: string;
  applicationController: string;
  depositAmount: string;
  status: string;
  registeredAt: string;
  activatedAt: string | null;
  blockNumber: string;
  transactionHash: string;
}

interface VaultProvidersResponse {
  vaultProviders: {
    items: VaultProvider[];
  };
}

interface VaultProviderResponse {
  vaultProvider: VaultProvider | null;
}

/**
 * Fetch all vault providers from GraphQL
 *
 * @returns Array of vault providers
 */
export async function fetchVaultProviders(): Promise<VaultProvider[]> {
  const data =
    await graphqlClient.request<VaultProvidersResponse>(GET_VAULT_PROVIDERS);

  return data.vaultProviders.items;
}

/**
 * Fetch a single vault provider by ID from GraphQL
 *
 * @param providerId - Vault provider ID (Ethereum address)
 * @returns Vault provider data, or null if not found
 */
export async function fetchVaultProviderById(
  providerId: string,
): Promise<VaultProvider | null> {
  const data = await graphqlClient.request<VaultProviderResponse>(
    GET_VAULT_PROVIDER_BY_ID,
    { id: providerId.toLowerCase() },
  );

  return data.vaultProvider;
}
