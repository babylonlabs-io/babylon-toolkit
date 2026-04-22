/**
 * Fetch vaults via GraphQL
 *
 * Plain JS function for fetching vault data that can be used
 * in both React hooks and Node.js environments.
 */

import { gql } from "graphql-request";
import type { Address, Hex } from "viem";

import { logger } from "@/infrastructure";

import { graphqlClient } from "../../clients/graphql/client";
import type { ExpirationReason } from "../../models/peginStateMachine";
import { type Vault, VaultStatus } from "../../types/vault";
import {
  BTC_PUBKEY_HEX_PATTERN,
  ETH_ADDRESS_PATTERN,
  VALID_HEX_PATTERN,
} from "../../utils/validation";

/**
 * Common vault fields fragment
 */
const VAULT_FIELDS = `
  id
  depositor
  depositorBtcPubKey
  vaultProvider
  amount
  applicationEntryPoint
  status
  inUse
  ackCount
  depositorSignedPeginTx
  unsignedPrePeginTx
  peginTxHash
  hashlock
  htlcVout
  secret
  peginSigsPostedAt
  appVaultKeepersVersion
  universalChallengersVersion
  offchainParamsVersion
  currentOwner
  referralCode
  depositorPayoutBtcAddress
  depositorWotsPkHash
  btcPopSignature
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
  | "signatures_collected"
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
  applicationEntryPoint: string;
  status: GraphQLVaultStatus;
  inUse: boolean;
  ackCount: number;
  depositorSignedPeginTx: string;
  unsignedPrePeginTx: string;
  peginTxHash: string;
  hashlock: string | null;
  htlcVout: number;
  secret: string | null;
  peginSigsPostedAt: string | null;
  appVaultKeepersVersion: number;
  universalChallengersVersion: number;
  offchainParamsVersion: number;
  currentOwner: string | null;
  referralCode: number;
  depositorPayoutBtcAddress: string;
  depositorWotsPkHash: string | null;
  btcPopSignature: string | null;
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
    case "signatures_collected":
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
      throw new Error(
        `Unknown GraphQL vault status "${status as string}" — refusing to map to an actionable state`,
      );
  }
}

/**
 * Validates that a required GraphQL field is non-null and non-undefined.
 * Throws if the field is nullish, since this indicates a buggy or compromised server response.
 */
function validateRequiredField<T>(
  value: T | null | undefined,
  fieldName: string,
  vaultId: string,
): T {
  if (value == null) {
    throw new Error(
      `Missing required field "${fieldName}" for vault ${vaultId}`,
    );
  }
  return value;
}

/** Zero-hash constant (32 zero bytes) — treated as "not set" by the indexer */
const ZERO_HASH =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

/**
 * Validates that a required hex field from the indexer is well-formed.
 * Throws if the value does not match 0x-prefixed hex — this indicates
 * a buggy or compromised server response.
 */
function validateRequiredHex(
  value: string,
  fieldName: string,
  vaultId: string,
): Hex {
  if (!VALID_HEX_PATTERN.test(value)) {
    throw new Error(
      `Malformed hex in required field "${fieldName}" for vault ${vaultId}: "${value.slice(0, 20)}"`,
    );
  }
  return value as Hex;
}

/**
 * Validates that a required BTC public key field from the indexer has a valid
 * encoding length (x-only 64, compressed 66, or uncompressed 130 hex chars).
 * Throws on invalid format.
 */
function validateRequiredBtcPubkey(
  value: string,
  fieldName: string,
  vaultId: string,
): Hex {
  if (!BTC_PUBKEY_HEX_PATTERN.test(value)) {
    throw new Error(
      `Invalid BTC public key in field "${fieldName}" for vault ${vaultId}: "${String(value).slice(0, 20)}"`,
    );
  }
  return value as Hex;
}

/**
 * Validates that a required address field from the indexer is a well-formed
 * 20-byte Ethereum address. Throws on invalid format.
 */
function validateRequiredAddress(
  value: string,
  fieldName: string,
  vaultId: string,
): Address {
  if (!ETH_ADDRESS_PATTERN.test(value)) {
    throw new Error(
      `Invalid address in field "${fieldName}" for vault ${vaultId}: "${value.slice(0, 20)}"`,
    );
  }
  return value as Address;
}

/**
 * Normalize an optional hex field from the indexer.
 * Treats null, "0x" (empty bytes), and zero-hash as undefined.
 */
function normalizeOptionalHex(value: string | null): Hex | undefined {
  if (!value || value === "0x" || value === ZERO_HASH) return undefined;
  if (!VALID_HEX_PATTERN.test(value)) {
    logger.warn(
      `[fetchVaults] Malformed hex value from indexer: ${value.slice(0, 20)}...`,
    );
    return undefined;
  }
  return value as Hex;
}

const VALID_EXPIRATION_REASONS: ReadonlySet<string> = new Set([
  "ack_timeout",
  "proof_timeout",
  "activation_timeout",
]);

function isValidExpirationReason(
  value: string | null | undefined,
): value is ExpirationReason {
  return typeof value === "string" && VALID_EXPIRATION_REASONS.has(value);
}

/**
 * Transform GraphQL vault item to Vault
 */
function transformVaultItem(item: GraphQLVaultItem): Vault {
  return {
    id: validateRequiredHex(item.id, "id", item.id),
    peginTxHash: validateRequiredHex(
      validateRequiredField(item.peginTxHash, "peginTxHash", item.id),
      "peginTxHash",
      item.id,
    ),
    depositor: validateRequiredAddress(item.depositor, "depositor", item.id),
    depositorBtcPubkey: validateRequiredBtcPubkey(
      item.depositorBtcPubKey,
      "depositorBtcPubKey",
      item.id,
    ),
    depositorSignedPeginTx: validateRequiredHex(
      item.depositorSignedPeginTx,
      "depositorSignedPeginTx",
      item.id,
    ),
    unsignedPrePeginTx: validateRequiredHex(
      validateRequiredField(
        item.unsignedPrePeginTx,
        "unsignedPrePeginTx",
        item.id,
      ),
      "unsignedPrePeginTx",
      item.id,
    ),
    amount: BigInt(item.amount),
    vaultProvider: validateRequiredAddress(
      item.vaultProvider,
      "vaultProvider",
      item.id,
    ),
    hashlock: normalizeOptionalHex(item.hashlock),
    htlcVout: item.htlcVout,
    secret: normalizeOptionalHex(item.secret),
    peginSigsPostedAt: item.peginSigsPostedAt
      ? parseInt(item.peginSigsPostedAt, 10) * 1000
      : undefined,
    status: mapGraphQLStatusToVaultStatus(item.status),
    applicationEntryPoint: validateRequiredAddress(
      item.applicationEntryPoint,
      "applicationEntryPoint",
      item.id,
    ),
    appVaultKeepersVersion: item.appVaultKeepersVersion,
    universalChallengersVersion: item.universalChallengersVersion,
    offchainParamsVersion: item.offchainParamsVersion,
    currentOwner: item.currentOwner
      ? validateRequiredAddress(item.currentOwner, "currentOwner", item.id)
      : undefined,
    referralCode: item.referralCode,
    depositorPayoutBtcAddress: validateRequiredHex(
      item.depositorPayoutBtcAddress,
      "depositorPayoutBtcAddress",
      item.id,
    ),
    depositorWotsPkHash: validateRequiredHex(
      validateRequiredField(
        item.depositorWotsPkHash,
        "depositorWotsPkHash",
        item.id,
      ),
      "depositorWotsPkHash",
      item.id,
    ),
    btcPopSignature: normalizeOptionalHex(item.btcPopSignature),
    createdAt: parseInt(item.pendingAt, 10) * 1000,
    expiredAt: item.expiredAt ? parseInt(item.expiredAt, 10) * 1000 : undefined,
    expirationReason: isValidExpirationReason(item.expirationReason)
      ? item.expirationReason
      : undefined,
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

  const vaults: Vault[] = [];
  for (const item of data.vaults.items) {
    try {
      vaults.push(transformVaultItem(item));
    } catch (error) {
      logger.error(error instanceof Error ? error : new Error(String(error)), {
        tags: { vaultId: item.id, component: "fetchVaults" },
        data: { rawStatus: item.status },
      });
    }
  }
  return vaults;
}

/**
 * Fetch a single vault by ID from GraphQL
 *
 * @param vaultId - Vault ID (derived: keccak256(abi.encode(peginTxHash, depositor)))
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

/**
 * Minimal fields needed by the refund flow — excludes unrelated required
 * fields on the full {@link Vault} projection so that indexer schema drift or
 * partial responses on non-refund fields (e.g. `depositorWotsPkHash`) cannot
 * block a critical recovery path.
 */
export interface VaultRefundIndexerData {
  depositorBtcPubkey: Hex;
  amount: bigint;
  unsignedPrePeginTx: Hex;
}

const GET_VAULT_REFUND_DATA = gql`
  query GetVaultRefundData($id: String!) {
    vault(id: $id) {
      id
      depositorBtcPubKey
      amount
      unsignedPrePeginTx
    }
  }
`;

interface VaultRefundGraphQLItem {
  id: string;
  depositorBtcPubKey: string;
  amount: string;
  unsignedPrePeginTx: string | null;
}

interface VaultRefundGraphQLResponse {
  vault: VaultRefundGraphQLItem | null;
}

/**
 * Fetch only the indexer fields the refund flow requires.
 * Throws if the vault or its `unsignedPrePeginTx` is missing — both are
 * required to build a refund PSBT.
 */
export async function fetchVaultRefundData(
  vaultId: Hex,
): Promise<VaultRefundIndexerData | null> {
  const data = await graphqlClient.request<VaultRefundGraphQLResponse>(
    GET_VAULT_REFUND_DATA,
    { id: vaultId.toLowerCase() },
  );

  if (!data.vault) {
    return null;
  }

  const { depositorBtcPubKey, amount, unsignedPrePeginTx } = data.vault;
  if (!unsignedPrePeginTx) {
    throw new Error(
      `Vault ${vaultId} is missing unsignedPrePeginTx; cannot build refund`,
    );
  }
  return {
    depositorBtcPubkey: validateRequiredBtcPubkey(
      depositorBtcPubKey,
      "depositorBtcPubKey",
      vaultId,
    ),
    amount: BigInt(amount),
    unsignedPrePeginTx: validateRequiredHex(
      unsignedPrePeginTx,
      "unsignedPrePeginTx",
      vaultId,
    ),
  };
}
