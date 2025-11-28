/**
 * Fetch vaults via GraphQL
 *
 * Plain JS function for fetching vault data that can be used
 * in both React hooks and Node.js environments.
 */

import { gql } from "graphql-request";
import type { Address, Hex } from "viem";

import type { Vault } from "../../clients/eth-contract";
import { graphqlClient } from "../../clients/graphql/client";
import { ContractStatus } from "../../models/peginStateMachine";

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
  inclusionProofVerifiedAt
  activatedAt
  blockNumber
  transactionHash
  app {
    status
    metadata
    updatedAt
  }
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
  inclusionProofVerifiedAt: string | null;
  activatedAt: string | null;
  blockNumber: string;
  transactionHash: string;
  app: {
    status: string;
    metadata: string | null;
    updatedAt: string;
  } | null;
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
 * Vault with usage status
 */
export interface VaultWithUsageStatus {
  vault: Vault;
  txHash: Hex;
  isInUse: boolean;
}

/**
 * Map GraphQL status string to contract status number
 */
function mapGraphQLStatusToContract(status: GraphQLVaultStatus): number {
  switch (status) {
    case "pending":
      return ContractStatus.PENDING;
    case "verified":
      return ContractStatus.VERIFIED;
    case "available":
      return ContractStatus.ACTIVE;
    case "redeemed":
      return ContractStatus.REDEEMED;
    case "invalid":
      return ContractStatus.PENDING;
    default:
      return ContractStatus.PENDING;
  }
}

/**
 * Transform GraphQL vault item to VaultWithUsageStatus
 */
function transformVaultItem(item: GraphQLVaultItem): VaultWithUsageStatus {
  const vault: Vault = {
    depositor: item.depositor as Address,
    depositorBtcPubkey: item.depositorBtcPubKey as Hex,
    unsignedBtcTx: item.unsignedPegInTx as Hex,
    amount: BigInt(item.amount),
    vaultProvider: item.vaultProvider as Address,
    status: mapGraphQLStatusToContract(item.status),
    applicationController: item.applicationController as Address,
  };

  const isInUse = item.app?.status === "InUse";

  return {
    vault,
    txHash: item.id as Hex,
    isInUse,
  };
}

/**
 * Fetch vaults by depositor address from GraphQL
 *
 * @param depositorAddress - Depositor's Ethereum address
 * @returns Array of vaults with usage status
 */
export async function fetchVaultsByDepositor(
  depositorAddress: Address,
): Promise<VaultWithUsageStatus[]> {
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
 * @returns Vault with usage status, or null if not found
 */
export async function fetchVaultById(
  vaultId: Hex,
): Promise<VaultWithUsageStatus | null> {
  const data = await graphqlClient.request<VaultGraphQLResponse>(
    GET_VAULT_BY_ID,
    { id: vaultId.toLowerCase() },
  );

  if (!data.vault) {
    return null;
  }

  return transformVaultItem(data.vault);
}
