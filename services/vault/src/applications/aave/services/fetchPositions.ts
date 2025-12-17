/**
 * Aave Positions Service
 *
 * Fetches Aave position data from the GraphQL indexer.
 * Positions represent user lending positions with collateral.
 */

import { gql } from "graphql-request";

import { graphqlClient } from "../../../clients/graphql";

/**
 * Aave position from GraphQL indexer
 * Position is active if totalCollateral > 0
 */
export interface AavePosition {
  /** Position ID (bytes32 hex string) */
  id: string;
  /** User's ETH address */
  depositor: string;
  /** User's BTC public key */
  depositorBtcPubKey: string;
  /** Aave reserve ID for the collateral */
  reserveId: bigint;
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
 * Tracks which vaults are used as collateral in a position
 */
export interface AavePositionCollateral {
  /** Composite ID: `${positionId}-${vaultId}` */
  id: string;
  /** Position ID */
  positionId: string;
  /** Vault ID (pegInTxHash) */
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
  id: string;
  depositor: string;
  depositorBtcPubKey: string;
  reserveId: string;
  proxyContract: string;
  totalCollateral: string;
  createdAt: string;
  updatedAt: string;
}

/** GraphQL collateral item shape */
interface GraphQLCollateralItem {
  id: string;
  positionId: string;
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

/** GraphQL response for user positions */
interface GraphQLUserPositionsResponse {
  aavePositions: {
    items: GraphQLPositionItem[];
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

const GET_AAVE_USER_POSITIONS = gql`
  query GetAaveUserPositions($depositor: String!) {
    aavePositions(where: { depositor: $depositor }) {
      items {
        id
        depositor
        depositorBtcPubKey
        reserveId
        proxyContract
        totalCollateral
        createdAt
        updatedAt
      }
    }
  }
`;

const GET_AAVE_ACTIVE_POSITIONS = gql`
  query GetAaveActivePositions($depositor: String!) {
    aavePositions(where: { depositor: $depositor }) {
      items {
        id
        depositor
        depositorBtcPubKey
        reserveId
        proxyContract
        totalCollateral
        createdAt
        updatedAt
      }
    }
  }
`;

const GET_AAVE_ACTIVE_POSITIONS_WITH_COLLATERALS = gql`
  query GetAaveActivePositionsWithCollaterals($depositor: String!) {
    aavePositions(where: { depositor: $depositor }) {
      items {
        id
        depositor
        depositorBtcPubKey
        reserveId
        proxyContract
        totalCollateral
        createdAt
        updatedAt
        collaterals {
          items {
            id
            positionId
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
  query GetAavePositionCollaterals($positionId: String!) {
    aavePositionCollaterals(where: { positionId: $positionId }) {
      items {
        id
        positionId
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

const GET_AAVE_POSITION_BY_ID = gql`
  query GetAavePositionById($id: String!) {
    aavePosition(id: $id) {
      id
      depositor
      depositorBtcPubKey
      reserveId
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
    id: item.id,
    depositor: item.depositor,
    depositorBtcPubKey: item.depositorBtcPubKey,
    reserveId: BigInt(item.reserveId),
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
    id: item.id,
    positionId: item.positionId,
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
 * Fetches all Aave positions for a user from the GraphQL indexer.
 *
 * @param depositor - User's Ethereum address (lowercase)
 * @returns Array of Aave positions
 */
export async function fetchAaveUserPositions(
  depositor: string,
): Promise<AavePosition[]> {
  const response = await graphqlClient.request<GraphQLUserPositionsResponse>(
    GET_AAVE_USER_POSITIONS,
    { depositor: depositor.toLowerCase() },
  );

  return response.aavePositions.items.map(mapGraphQLPositionToAavePosition);
}

/**
 * Fetches active Aave positions for a user from the GraphQL indexer.
 *
 * @param depositor - User's Ethereum address (lowercase)
 * @returns Array of active Aave positions
 */
export async function fetchAaveActivePositions(
  depositor: string,
): Promise<AavePosition[]> {
  const response = await graphqlClient.request<GraphQLUserPositionsResponse>(
    GET_AAVE_ACTIVE_POSITIONS,
    { depositor: depositor.toLowerCase() },
  );

  return response.aavePositions.items.map(mapGraphQLPositionToAavePosition);
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
      { depositor: depositor.toLowerCase() },
    );

  return response.aavePositions.items.map((item) => ({
    ...mapGraphQLPositionToAavePosition(item),
    collaterals: item.collaterals.items.map(
      mapGraphQLCollateralToAavePositionCollateral,
    ),
  }));
}

/**
 * Fetches a single Aave position by ID from the GraphQL indexer.
 *
 * @param positionId - Position ID (bytes32 hex string)
 * @returns Aave position or null if not found
 */
export async function fetchAavePositionById(
  positionId: string,
): Promise<AavePosition | null> {
  const response = await graphqlClient.request<{
    aavePosition: GraphQLPositionItem | null;
  }>(GET_AAVE_POSITION_BY_ID, { id: positionId });

  if (!response.aavePosition) {
    return null;
  }

  return mapGraphQLPositionToAavePosition(response.aavePosition);
}

/**
 * Fetches collateral entries for a position from the GraphQL indexer.
 *
 * @param positionId - Position ID (bytes32 hex string)
 * @returns Array of collateral entries with vault data
 */
export async function fetchAavePositionCollaterals(
  positionId: string,
): Promise<AavePositionCollateral[]> {
  const response =
    await graphqlClient.request<GraphQLPositionCollateralsResponse>(
      GET_AAVE_POSITION_COLLATERALS,
      { positionId },
    );

  return response.aavePositionCollaterals.items.map(
    mapGraphQLCollateralToAavePositionCollateral,
  );
}

/**
 * Fetches a position with its collateral entries from the GraphQL indexer.
 * Combines position data with collateral data in a single response.
 *
 * @param positionId - Position ID (bytes32 hex string)
 * @param depositor - User's Ethereum address (to find the position)
 * @returns Position with collaterals or null if not found
 */
export async function fetchAavePositionWithCollaterals(
  positionId: string,
  depositor: string,
): Promise<AavePositionWithCollaterals | null> {
  // Fetch position and collaterals in parallel
  const [positionsResponse, collateralsResponse] = await Promise.all([
    graphqlClient.request<GraphQLUserPositionsResponse>(
      GET_AAVE_USER_POSITIONS,
      { depositor: depositor.toLowerCase() },
    ),
    graphqlClient.request<GraphQLPositionCollateralsResponse>(
      GET_AAVE_POSITION_COLLATERALS,
      { positionId },
    ),
  ]);

  // Find the specific position
  const positionItem = positionsResponse.aavePositions.items.find(
    (item) => item.id.toLowerCase() === positionId.toLowerCase(),
  );

  if (!positionItem) {
    return null;
  }

  const position = mapGraphQLPositionToAavePosition(positionItem);
  const collaterals = collateralsResponse.aavePositionCollaterals.items.map(
    mapGraphQLCollateralToAavePositionCollateral,
  );

  return {
    ...position,
    collaterals,
  };
}
