/**
 * Aave Positions Service
 *
 * Fetches Aave position data from the GraphQL indexer.
 * Positions represent user lending positions with collateral.
 * Position is keyed by depositor address (one position per user).
 */

import { gql } from "graphql-request";

import { graphqlClient } from "../../../clients/graphql";

/**
 * Aave position from GraphQL indexer
 * Position is active if totalCollateral > 0
 * Keyed by depositorAddress (one position per user).
 */
export interface AavePosition {
  /** Depositor's ETH address (primary key) */
  depositorAddress: string;
  /** Proxy contract holding the position */
  proxyContract: string;
  /** Total vBTC collateral (8 decimals) */
  totalCollateral: bigint;
  /** Creation timestamp */
  createdAt: bigint;
  /** Last update timestamp */
  updatedAt: bigint;
}

/**
 * Aave position collateral entry
 * Tracks which vaults are used as collateral in a position.
 * Composite primary key: (depositorAddress, vaultId)
 */
export interface AavePositionCollateral {
  /** Depositor's ETH address (part of composite key) */
  depositorAddress: string;
  /** Vault ID: keccak256(abi.encode(peginTxHash, depositor)) (part of composite key) */
  vaultId: string;
  /** Collateral amount from this vault */
  amount: bigint;
  /** Timestamp when added */
  addedAt: bigint;
  /** Timestamp when removed (null if still active) */
  removedAt: bigint | null;
  /** Liquidation priority index (0 = seized first). Updated on VaultsReordered events. */
  liquidationIndex: number;
  /** Associated vault data */
  vault?: {
    id: string;
    peginTxHash: string;
    amount: bigint;
    status: string;
    vaultProvider: string;
    inUse: boolean;
    depositorBtcPubKey: string;
    /** On-chain registered payout scriptPubKey (0x-prefixed hex). Where BTC is sent on withdraw. */
    depositorPayoutBtcAddress: string;
    /**
     * Unsigned pre-pegin BTC transaction hex (from PegInSubmitted event).
     * Needed to re-derive the VP auth anchor when the in-memory token
     * registry is cold (e.g. collateral artifact re-download).
     */
    unsignedPrePeginTx?: string;
  };
}

/**
 * Position with collaterals combined
 */
export interface AavePositionWithCollaterals extends AavePosition {
  collaterals: AavePositionCollateral[];
}

/** GraphQL position item shape */
interface GraphQLPositionItem {
  depositorAddress: string;
  proxyContract: string;
  totalCollateral: string;
  createdAt: string;
  updatedAt: string;
}

/** GraphQL collateral item shape */
interface GraphQLCollateralItem {
  depositorAddress: string;
  vaultId: string;
  amount: string;
  addedAt: string;
  removedAt: string | null;
  liquidationIndex: string;
  vault?: {
    id: string;
    peginTxHash: string;
    amount: string;
    status: string;
    vaultProvider: string;
    inUse: boolean;
    depositorBtcPubKey: string;
    depositorPayoutBtcAddress: string;
    unsignedPrePeginTx?: string;
  };
}

/** GraphQL position item with nested collaterals */
interface GraphQLPositionItemWithCollaterals extends GraphQLPositionItem {
  collaterals: {
    items: GraphQLCollateralItem[];
  };
}

/** GraphQL response for user positions with collaterals */
interface GraphQLUserPositionsWithCollateralsResponse {
  aavePositions: {
    items: GraphQLPositionItemWithCollaterals[];
  };
}

const GET_AAVE_ACTIVE_POSITIONS_WITH_COLLATERALS = gql`
  query GetAaveActivePositionsWithCollaterals($depositorAddress: String!) {
    aavePositions(where: { depositorAddress: $depositorAddress }) {
      items {
        depositorAddress
        proxyContract
        totalCollateral
        createdAt
        updatedAt
        collaterals {
          items {
            depositorAddress
            vaultId
            amount
            addedAt
            removedAt
            liquidationIndex
            vault {
              id
              peginTxHash
              amount
              status
              vaultProvider
              inUse
              depositorBtcPubKey
              depositorPayoutBtcAddress
              unsignedPrePeginTx
            }
          }
        }
      }
    }
  }
`;

/**
 * Maps a GraphQL position item to AavePosition
 */
function mapGraphQLPositionToAavePosition(
  item: GraphQLPositionItem,
): AavePosition {
  return {
    depositorAddress: item.depositorAddress,
    proxyContract: item.proxyContract,
    totalCollateral: BigInt(item.totalCollateral),
    createdAt: BigInt(item.createdAt),
    updatedAt: BigInt(item.updatedAt),
  };
}

/**
 * Maps a GraphQL collateral item to AavePositionCollateral
 */
function mapGraphQLCollateralToAavePositionCollateral(
  item: GraphQLCollateralItem,
): AavePositionCollateral {
  return {
    depositorAddress: item.depositorAddress,
    vaultId: item.vaultId,
    amount: BigInt(item.amount),
    addedAt: BigInt(item.addedAt),
    removedAt: item.removedAt ? BigInt(item.removedAt) : null,
    liquidationIndex: Number(item.liquidationIndex),
    vault: item.vault
      ? {
          id: item.vault.id,
          peginTxHash: item.vault.peginTxHash,
          amount: BigInt(item.vault.amount),
          status: item.vault.status,
          vaultProvider: item.vault.vaultProvider,
          inUse: item.vault.inUse,
          depositorBtcPubKey: item.vault.depositorBtcPubKey,
          depositorPayoutBtcAddress: item.vault.depositorPayoutBtcAddress,
          unsignedPrePeginTx: item.vault.unsignedPrePeginTx,
        }
      : undefined,
  };
}

/**
 * Fetches active Aave positions with their collaterals in a single GraphQL call.
 * More efficient than fetching positions and collaterals separately (avoids N+1 queries).
 *
 * @param depositor - User's Ethereum address (lowercase)
 * @returns Array of active Aave positions with collaterals
 */
export async function fetchAaveActivePositionsWithCollaterals(
  depositor: string,
): Promise<AavePositionWithCollaterals[]> {
  const response =
    await graphqlClient.request<GraphQLUserPositionsWithCollateralsResponse>(
      GET_AAVE_ACTIVE_POSITIONS_WITH_COLLATERALS,
      { depositorAddress: depositor.toLowerCase() },
    );

  return response.aavePositions.items.map((item) => ({
    ...mapGraphQLPositionToAavePosition(item),
    collaterals: item.collaterals.items.map(
      mapGraphQLCollateralToAavePositionCollateral,
    ),
  }));
}
