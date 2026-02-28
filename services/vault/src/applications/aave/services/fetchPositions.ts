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
  /** Vault ID (pegInTxHash, part of composite key) */
  vaultId: string;
  /** Collateral amount from this vault */
  amount: bigint;
  /** Timestamp when added */
  addedAt: bigint;
  /** Timestamp when removed (null if still active) */
  removedAt: bigint | null;
  /** Associated vault data */
  vault?: {
    id: string;
    amount: bigint;
    status: string;
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
  vault?: {
    id: string;
    amount: string;
    status: string;
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

/** GraphQL response for position collaterals */
interface GraphQLPositionCollateralsResponse {
  aavePositionCollaterals: {
    items: GraphQLCollateralItem[];
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
            vault {
              id
              amount
              status
            }
          }
        }
      }
    }
  }
`;

const GET_AAVE_POSITION_COLLATERALS = gql`
  query GetAavePositionCollaterals($depositorAddress: String!) {
    aavePositionCollaterals(where: { depositorAddress: $depositorAddress }) {
      items {
        depositorAddress
        vaultId
        amount
        addedAt
        removedAt
        vault {
          id
          amount
          status
        }
      }
    }
  }
`;

const GET_AAVE_POSITION_BY_DEPOSITOR = gql`
  query GetAavePositionByDepositor($depositorAddress: String!) {
    aavePosition(depositorAddress: $depositorAddress) {
      depositorAddress
      proxyContract
      totalCollateral
      createdAt
      updatedAt
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
    vault: item.vault
      ? {
          id: item.vault.id,
          amount: BigInt(item.vault.amount),
          status: item.vault.status,
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

/**
 * Fetches a single Aave position by depositor address from the GraphQL indexer.
 *
 * @param depositorAddress - User's Ethereum address
 * @returns Aave position or null if not found
 */
export async function fetchAavePositionByDepositor(
  depositorAddress: string,
): Promise<AavePosition | null> {
  const response = await graphqlClient.request<{
    aavePosition: GraphQLPositionItem | null;
  }>(GET_AAVE_POSITION_BY_DEPOSITOR, {
    depositorAddress: depositorAddress.toLowerCase(),
  });

  if (!response.aavePosition) {
    return null;
  }

  return mapGraphQLPositionToAavePosition(response.aavePosition);
}

/**
 * Fetches collateral entries for a position from the GraphQL indexer.
 *
 * @param depositorAddress - Depositor's Ethereum address
 * @returns Array of collateral entries with vault data
 */
export async function fetchAavePositionCollaterals(
  depositorAddress: string,
): Promise<AavePositionCollateral[]> {
  const response =
    await graphqlClient.request<GraphQLPositionCollateralsResponse>(
      GET_AAVE_POSITION_COLLATERALS,
      { depositorAddress: depositorAddress.toLowerCase() },
    );

  return response.aavePositionCollaterals.items.map(
    mapGraphQLCollateralToAavePositionCollateral,
  );
}

/**
 * Fetches a position with its collateral entries from the GraphQL indexer.
 * Combines position data with collateral data in a single response.
 *
 * @param depositorAddress - User's Ethereum address
 * @returns Position with collaterals or null if not found
 */
export async function fetchAavePositionWithCollaterals(
  depositorAddress: string,
): Promise<AavePositionWithCollaterals | null> {
  // Fetch position and collaterals in parallel
  const [positionResponse, collateralsResponse] = await Promise.all([
    graphqlClient.request<{
      aavePosition: GraphQLPositionItem | null;
    }>(GET_AAVE_POSITION_BY_DEPOSITOR, {
      depositorAddress: depositorAddress.toLowerCase(),
    }),
    graphqlClient.request<GraphQLPositionCollateralsResponse>(
      GET_AAVE_POSITION_COLLATERALS,
      { depositorAddress: depositorAddress.toLowerCase() },
    ),
  ]);

  if (!positionResponse.aavePosition) {
    return null;
  }

  const position = mapGraphQLPositionToAavePosition(
    positionResponse.aavePosition,
  );
  const collaterals = collateralsResponse.aavePositionCollaterals.items.map(
    mapGraphQLCollateralToAavePositionCollateral,
  );

  return {
    ...position,
    collaterals,
  };
}
