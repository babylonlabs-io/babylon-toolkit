/**
 * Aave Vault Status Service
 *
 * Fetches vault usage status within Aave from the GraphQL indexer.
 * Status indicates whether a vault is none (unregistered), collateralized, escrowed, or redeemed.
 */

import { gql } from "graphql-request";

import { graphqlClient } from "../../../clients/graphql";

/**
 * Aave vault usage status
 * - "none": Default for uninitialized entries; vault not registered with Aave
 * - "collateralized": Vault is backing an Aave position
 * - "escrowed": Vault is in VaultSwap escrow after liquidation
 * - "redeemed": Vault has been redeemed
 */
export type AaveVaultUsageStatus =
  | "none"
  | "collateralized"
  | "escrowed"
  | "redeemed";

/**
 * Aave vault status entry
 */
export interface AaveVaultStatus {
  /** Vault ID (pegInTxHash) */
  vaultId: string;
  /** Application controller address */
  applicationController: string;
  /** Vault usage status */
  status: AaveVaultUsageStatus;
  /** Last update timestamp */
  updatedAt: bigint;
}

/** GraphQL vault status item shape */
interface GraphQLVaultStatusItem {
  vaultId: string;
  applicationController: string;
  status: AaveVaultUsageStatus;
  updatedAt: string;
}

/** GraphQL response shape */
interface GraphQLVaultStatusesResponse {
  aaveVaultStatuss: {
    items: GraphQLVaultStatusItem[];
  };
}

const GET_AAVE_VAULT_STATUSES = gql`
  query GetAaveVaultStatuses($vaultIds: [String!]!) {
    aaveVaultStatuss(where: { vaultId_in: $vaultIds }) {
      items {
        vaultId
        applicationController
        status
        updatedAt
      }
    }
  }
`;

const GET_AAVE_VAULT_STATUS = gql`
  query GetAaveVaultStatus($vaultId: String!) {
    aaveVaultStatus(vaultId: $vaultId) {
      vaultId
      applicationController
      status
      updatedAt
    }
  }
`;

/**
 * Maps a GraphQL vault status item to AaveVaultStatus
 */
function mapGraphQLVaultStatusToAaveVaultStatus(
  item: GraphQLVaultStatusItem,
): AaveVaultStatus {
  return {
    vaultId: item.vaultId,
    applicationController: item.applicationController,
    status: item.status,
    updatedAt: BigInt(item.updatedAt),
  };
}

/**
 * Fetches vault usage statuses for multiple vaults from the GraphQL indexer.
 *
 * @param vaultIds - Array of vault IDs (pegInTxHashes)
 * @returns Map of vault ID to status
 */
export async function fetchAaveVaultStatuses(
  vaultIds: string[],
): Promise<Map<string, AaveVaultStatus>> {
  if (vaultIds.length === 0) {
    return new Map();
  }

  const response = await graphqlClient.request<GraphQLVaultStatusesResponse>(
    GET_AAVE_VAULT_STATUSES,
    { vaultIds },
  );

  const statusMap = new Map<string, AaveVaultStatus>();

  for (const item of response.aaveVaultStatuss.items) {
    statusMap.set(
      item.vaultId.toLowerCase(),
      mapGraphQLVaultStatusToAaveVaultStatus(item),
    );
  }

  return statusMap;
}

/**
 * Fetches vault usage status for a single vault from the GraphQL indexer.
 *
 * @param vaultId - Vault ID (pegInTxHash)
 * @returns Vault status or null if not found
 */
export async function fetchAaveVaultStatus(
  vaultId: string,
): Promise<AaveVaultStatus | null> {
  const response = await graphqlClient.request<{
    aaveVaultStatus: GraphQLVaultStatusItem | null;
  }>(GET_AAVE_VAULT_STATUS, { vaultId });

  if (!response.aaveVaultStatus) {
    return null;
  }

  return mapGraphQLVaultStatusToAaveVaultStatus(response.aaveVaultStatus);
}

/**
 * Checks if a vault is available for use as collateral in Aave.
 *
 * @param vaultId - Vault ID (pegInTxHash)
 * @returns true if vault is available, false otherwise
 */
export async function isVaultAvailableForAave(
  vaultId: string,
): Promise<boolean> {
  const status = await fetchAaveVaultStatus(vaultId);
  // Vault is available if it has no Aave status entry or status is "none"
  return !status || status.status === "none";
}

/**
 * Filters vault IDs to only those available for use as collateral.
 *
 * @param vaultIds - Array of vault IDs to check
 * @returns Array of available vault IDs
 */
export async function filterAvailableVaults(
  vaultIds: string[],
): Promise<string[]> {
  if (vaultIds.length === 0) {
    return [];
  }

  const statuses = await fetchAaveVaultStatuses(vaultIds);

  return vaultIds.filter((vaultId) => {
    const status = statuses.get(vaultId.toLowerCase());
    // Vault is available if it has no Aave status entry or status is "none"
    return !status || status.status === "none";
  });
}
