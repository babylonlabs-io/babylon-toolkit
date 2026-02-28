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
  inUse
  ackCount
  unsignedPegInTx
  appVaultKeepersVersion
  universalChallengersVersion
  offchainParamsVersion
  currentOwner
  referralCode
  pendingAt
  verifiedAt
  activatedAt
  expiredAt
  expirationReason
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
 * GraphQL vault status values
 */
type GraphQLVaultStatus =
  | "pending"
  | "verified"
  | "available"
  | "redeemed"
  | "liquidated"
  | "expired"
  | "invalid"
  | "depositor_withdrawn";

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
  inUse: boolean;
  ackCount: number;
  unsignedPegInTx: string;
  appVaultKeepersVersion: number;
  universalChallengersVersion: number;
  offchainParamsVersion: number;
  currentOwner: string | null;
  referralCode: number;
  pendingAt: string;
  verifiedAt: string | null;
  activatedAt: string | null;
  expiredAt: string | null;
  expirationReason: string | null;
  blockNumber: string;
  transactionHash: string;
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
    case "liquidated":
      return VaultStatus.LIQUIDATED;
    case "expired":
      return VaultStatus.EXPIRED;
    case "invalid":
      return VaultStatus.INVALID;
    case "depositor_withdrawn":
      return VaultStatus.DEPOSITOR_WITHDRAWN;
    default:
      return VaultStatus.PENDING;
  }
}

/**
 * Transform GraphQL vault item to Vault
 */
function transformVaultItem(item: GraphQLVaultItem): Vault {
  return {
    id: item.id as Hex,
    depositor: item.depositor as Address,
    depositorBtcPubkey: item.depositorBtcPubKey as Hex,
    unsignedBtcTx: item.unsignedPegInTx as Hex,
    amount: BigInt(item.amount),
    vaultProvider: item.vaultProvider as Address,
    status: mapGraphQLStatusToVaultStatus(item.status),
    applicationController: item.applicationController as Address,
    appVaultKeepersVersion: item.appVaultKeepersVersion,
    universalChallengersVersion: item.universalChallengersVersion,
    offchainParamsVersion: item.offchainParamsVersion,
    currentOwner: item.currentOwner
      ? (item.currentOwner as Address)
      : undefined,
    referralCode: item.referralCode,
    createdAt: parseInt(item.pendingAt, 10) * 1000,
    expiredAt: item.expiredAt ? parseInt(item.expiredAt, 10) * 1000 : undefined,
    expirationReason: item.expirationReason ?? undefined,
    isInUse: item.inUse,
  };
}

/**
 * Fetch vaults by depositor address from GraphQL
 *
 * @param depositorAddress - Depositor's Ethereum address
 * @returns Array of vaults
 */
export async function fetchVaultsByDepositor(
  depositorAddress: Address,
): Promise<Vault[]> {
  const data = await graphqlClient.request<VaultsGraphQLResponse>(
    GET_VAULTS_BY_DEPOSITOR,
    { depositor: depositorAddress.toLowerCase() },
  );

  return data.vaults.items.map(transformVaultItem);
}

/**
 * Fetch a single vault by ID from GraphQL
 *
 * @param vaultId - Vault ID (pegin tx hash)
 * @returns Vault or null if not found
 */
export async function fetchVaultById(vaultId: Hex): Promise<Vault | null> {
  const data = await graphqlClient.request<VaultGraphQLResponse>(
    GET_VAULT_BY_ID,
    { id: vaultId.toLowerCase() },
  );

  if (!data.vault) {
    return null;
  }

  return transformVaultItem(data.vault);
}
