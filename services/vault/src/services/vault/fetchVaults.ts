/**
 * Fetch vaults via GraphQL
 *
 * Plain JS function for fetching vault data that can be used
 * in both React hooks and Node.js environments.
 */

import { gql } from "graphql-request";
import type { Address, Hex } from "viem";

import { graphqlClient } from "../../clients/graphql/client";
import { type Vault, VaultStatus } from "../../types/vault";

/**
 * Common vault fields fragment
 */
const VAULT_FIELDS = `
  id
  depositor
  depositorBtcPubKey
  vaultProvider
  amount
  applicationController
  status
  ackCount
  unsignedPegInTx
  pendingAt
  verifiedAt
  activatedAt
  blockNumber
  transactionHash
`;

/**
 * GraphQL query to fetch vaults by depositor address
 */
const GET_VAULTS_BY_DEPOSITOR = gql`
  query GetVaultsByDepositor($depositor: String!) {
    vaults(where: { depositor: $depositor }) {
      items {
        ${VAULT_FIELDS}
      }
      totalCount
    }
  }
`;

/**
 * GraphQL query to fetch a single vault by ID
 */
const GET_VAULT_BY_ID = gql`
  query GetVaultById($id: String!) {
    vault(id: $id) {
      ${VAULT_FIELDS}
    }
  }
`;

/**
 * GraphQL query to fetch Aave vault status by vault IDs
 */
const GET_AAVE_VAULT_STATUSES = gql`
  query GetAaveVaultStatuses($vaultIds: [String!]!) {
    aaveVaultStatuss(where: { vaultId_in: $vaultIds }) {
      items {
        vaultId
        status
      }
    }
  }
`;

/**
 * GraphQL vault status values
 */
type GraphQLVaultStatus =
  | "pending"
  | "verified"
  | "available"
  | "redeemed"
  | "invalid";

/**
 * Raw vault item from GraphQL
 */
interface GraphQLVaultItem {
  id: string;
  depositor: string;
  depositorBtcPubKey: string;
  vaultProvider: string;
  amount: string;
  applicationController: string;
  status: GraphQLVaultStatus;
  ackCount: number;
  unsignedPegInTx: string;
  pendingAt: string;
  verifiedAt: string | null;
  activatedAt: string | null;
  blockNumber: string;
  transactionHash: string;
}

/**
 * App-specific vault usage status values
 */
const AppVaultUsageStatus = {
  AVAILABLE: "available",
  IN_USE: "in_use",
  REDEEMED: "redeemed",
} as const;

type AppVaultUsageStatus =
  (typeof AppVaultUsageStatus)[keyof typeof AppVaultUsageStatus];

/**
 * App vault status item from GraphQL
 */
interface GraphQLAppVaultStatusItem {
  vaultId: string;
  status: AppVaultUsageStatus;
}

/**
 * GraphQL response for Aave vault statuses query
 */
interface AaveVaultStatusesResponse {
  aaveVaultStatuss: {
    items: GraphQLAppVaultStatusItem[];
  };
}

/**
 * Raw vault data from GraphQL response (list query)
 */
interface VaultsGraphQLResponse {
  vaults: {
    items: GraphQLVaultItem[];
    totalCount: number;
  };
}

/**
 * Raw vault data from GraphQL response (single query)
 */
interface VaultGraphQLResponse {
  vault: GraphQLVaultItem | null;
}

/**
 * Map GraphQL status string to VaultStatus enum
 */
function mapGraphQLStatusToVaultStatus(
  status: GraphQLVaultStatus,
): VaultStatus {
  switch (status) {
    case "pending":
      return VaultStatus.PENDING;
    case "verified":
      return VaultStatus.VERIFIED;
    case "available":
      return VaultStatus.ACTIVE;
    case "redeemed":
      return VaultStatus.REDEEMED;
    case "invalid":
      return VaultStatus.INVALID;
    default:
      return VaultStatus.PENDING;
  }
}

/**
 * Transform GraphQL vault item to Vault
 */
function transformVaultItem(item: GraphQLVaultItem, isInUse: boolean): Vault {
  return {
    id: item.id as Hex,
    depositor: item.depositor as Address,
    depositorBtcPubkey: item.depositorBtcPubKey as Hex,
    unsignedBtcTx: item.unsignedPegInTx as Hex,
    amount: BigInt(item.amount),
    vaultProvider: item.vaultProvider as Address,
    status: mapGraphQLStatusToVaultStatus(item.status),
    applicationController: item.applicationController as Address,
    createdAt: parseInt(item.pendingAt, 10) * 1000,
    isInUse,
  };
}

/**
 * Fetch app-specific vault statuses for given vault IDs
 * Queries Aave vault status table
 *
 * @returns Map of vaultId to isInUse boolean
 */
async function fetchAppVaultStatuses(
  vaultIds: string[],
): Promise<Map<string, boolean>> {
  if (vaultIds.length === 0) {
    return new Map();
  }

  const aaveData = await graphqlClient.request<AaveVaultStatusesResponse>(
    GET_AAVE_VAULT_STATUSES,
    { vaultIds },
  );

  const inUseMap = new Map<string, boolean>();

  // Check Aave statuses
  for (const item of aaveData.aaveVaultStatuss.items) {
    if (item.status === AppVaultUsageStatus.IN_USE) {
      inUseMap.set(item.vaultId, true);
    }
  }

  return inUseMap;
}

/**
 * Fetch vaults by depositor address from GraphQL
 *
 * Uses two-query pattern:
 * 1. Fetch core vault data
 * 2. Fetch app-specific vault statuses (Aave) to determine if vaults are in use
 *
 * @param depositorAddress - Depositor's Ethereum address
 * @returns Array of vaults with isInUse status
 */
export async function fetchVaultsByDepositor(
  depositorAddress: Address,
): Promise<Vault[]> {
  // 1. Fetch core vault data
  const data = await graphqlClient.request<VaultsGraphQLResponse>(
    GET_VAULTS_BY_DEPOSITOR,
    { depositor: depositorAddress.toLowerCase() },
  );

  const vaultItems = data.vaults.items;
  if (vaultItems.length === 0) {
    return [];
  }

  // 2. Fetch app-specific vault statuses
  const vaultIds = vaultItems.map((v) => v.id);
  const inUseMap = await fetchAppVaultStatuses(vaultIds);

  // 3. Merge and transform
  return vaultItems.map((item) => {
    const isInUse = inUseMap.get(item.id) ?? false;
    return transformVaultItem(item, isInUse);
  });
}

/**
 * Fetch a single vault by ID from GraphQL
 *
 * Uses two-query pattern to include app-specific vault status.
 *
 * @param vaultId - Vault ID (pegin tx hash)
 * @returns Vault with isInUse status, or null if not found
 */
export async function fetchVaultById(vaultId: Hex): Promise<Vault | null> {
  const data = await graphqlClient.request<VaultGraphQLResponse>(
    GET_VAULT_BY_ID,
    { id: vaultId.toLowerCase() },
  );

  if (!data.vault) {
    return null;
  }

  // Fetch app-specific vault statuses
  const inUseMap = await fetchAppVaultStatuses([data.vault.id]);
  const isInUse = inUseMap.get(data.vault.id) ?? false;

  return transformVaultItem(data.vault, isInUse);
}
