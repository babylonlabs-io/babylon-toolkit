/**
 * Fetch vault providers via GraphQL
 *
 * Plain JS function for fetching vault provider data that can be used
 * in both React hooks and Node.js environments.
 */

import { gql } from "graphql-request";

import { logger } from "@/infrastructure";

import { graphqlClient } from "../../clients/graphql/client";
import {
  BTC_PUBKEY_HEX_PATTERN,
  ETH_ADDRESS_PATTERN,
} from "../../utils/validation";

const GET_VAULT_PROVIDERS = gql`
  query GetVaultProviders {
    vaultProviders {
      items {
        id
        btcPubKey
        applicationEntryPoint
        name
        rpcUrl
        grpcUrl
        registeredAt
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
      applicationEntryPoint
      name
      rpcUrl
      grpcUrl
      registeredAt
      blockNumber
      transactionHash
    }
  }
`;

/**
 * Vault provider data shape (matches indexer vaultProvider entity)
 */
export interface VaultProvider {
  id: string;
  btcPubKey: string;
  applicationEntryPoint: string;
  name: string | null;
  rpcUrl: string | null;
  grpcUrl: string | null;
  registeredAt: string;
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
 * Validate critical fields on a vault provider from GraphQL.
 * Returns null (with a warning) if validation fails — one bad provider
 * should not crash the entire list fetch.
 */
function validateVaultProvider(item: VaultProvider): VaultProvider | null {
  if (!ETH_ADDRESS_PATTERN.test(item.id)) {
    logger.warn(
      `[fetchVaultProviders] Skipping provider with invalid id: "${item.id.slice(0, 20)}"`,
    );
    return null;
  }
  if (!BTC_PUBKEY_HEX_PATTERN.test(item.btcPubKey)) {
    logger.warn(
      `[fetchVaultProviders] Skipping provider ${item.id}: invalid btcPubKey format`,
    );
    return null;
  }
  if (!ETH_ADDRESS_PATTERN.test(item.applicationEntryPoint)) {
    logger.warn(
      `[fetchVaultProviders] Skipping provider ${item.id}: invalid applicationEntryPoint "${item.applicationEntryPoint.slice(0, 20)}"`,
    );
    return null;
  }
  return item;
}

/**
 * Fetch all vault providers from GraphQL
 *
 * @returns Array of vault providers (invalid entries are filtered out with warnings)
 */
export async function fetchVaultProviders(): Promise<VaultProvider[]> {
  const data =
    await graphqlClient.request<VaultProvidersResponse>(GET_VAULT_PROVIDERS);

  const providers: VaultProvider[] = [];
  for (const item of data.vaultProviders.items) {
    const validated = validateVaultProvider(item);
    if (validated) {
      providers.push(validated);
    }
  }
  return providers;
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

  if (!data.vaultProvider) {
    return null;
  }
  return validateVaultProvider(data.vaultProvider);
}
