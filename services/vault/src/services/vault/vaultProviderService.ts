/**
 * Vault Provider Service
 *
 * Handles fetching and managing vault provider data from the GraphQL API.
 */

import { gql } from "graphql-request";

import { graphqlClient } from "../../clients/graphql/config";
import type { VaultProvider } from "../../types/vaultProvider";

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

interface VaultProvidersResponse {
  vaultProviders: {
    items: Array<{
      id: string;
      btcPubKey: string;
      applicationController: string;
      depositAmount: string;
      status: string;
      registeredAt: string;
      activatedAt: string | null;
      blockNumber: string;
      transactionHash: string;
    }>;
  };
}

/**
 * Fetch all vault providers from the GraphQL indexer
 *
 * Note: This returns basic provider info from the indexer.
 * Provider RPC URLs and liquidators may need to be fetched from:
 * - REST API (/v1/providers)
 * - Separate GraphQL queries for liquidatorApplication
 * - Configuration files
 *
 * @returns Array of vault providers from indexer
 * @throws Error if API request fails
 */
export async function getVaultProviders(): Promise<VaultProvider[]> {
  const data =
    await graphqlClient.request<VaultProvidersResponse>(GET_VAULT_PROVIDERS);
  return data.vaultProviders.items.map((provider) => ({
    id: provider.id,
    btc_pub_key: provider.btcPubKey,
    application_controller: provider.applicationController,
    deposit_amount: provider.depositAmount,
    status: provider.status,
    registered_at: provider.registeredAt,
    activated_at: provider.activatedAt,
    block_number: provider.blockNumber,
    transaction_hash: provider.transactionHash,
  }));
}
