/**
 * Morpho Positions Service
 *
 * Fetches Morpho position data from the GraphQL indexer.
 * Positions represent a user's collateral and borrow state in a specific market.
 */

import { gql } from "graphql-request";

import { graphqlClient } from "../../../clients/graphql";

/**
 * Position status enum matching the indexer schema
 */
export type MorphoPositionStatus = "active" | "closed" | "liquidated";

/**
 * Collateral vault information from a position
 */
export interface MorphoPositionCollateralItem {
  /** Composite ID: `${positionId}-${vaultId}` */
  id: string;
  /** Position ID this collateral belongs to */
  positionId: string;
  /** Vault ID (pegInTxHash) */
  vaultId: string;
  /** Collateral amount from this vault */
  amount: string;
  /** Block timestamp when added */
  addedAt: string;
  /** Block timestamp when removed (null if still active) */
  removedAt: string | null;
}

/**
 * Morpho position information from GraphQL
 * Matches the position schema in babylon-vault-indexer
 */
export interface MorphoPositionFromIndexer {
  /** Position ID (bytes32 hex string) */
  id: string;
  /** User's ETH address */
  depositor: string;
  /** Morpho market ID */
  marketId: string;
  /** Proxy contract holding the position */
  proxyContract: string;
  /** Total vBTC collateral (8 decimals) - indexed snapshot */
  totalCollateral: string;
  /** Position status */
  status: MorphoPositionStatus;
  /** Block timestamp when created */
  createdAt: string;
  /** Block timestamp when last updated */
  updatedAt: string;
  /** Block number when last updated */
  blockNumber: string;
  /** Transaction hash of last update */
  transactionHash: string;
  /** Collateral vaults in this position */
  collaterals?: MorphoPositionCollateralItem[];
  /** Market data (from relation) */
  market?: {
    id: string;
    loanTokenAddress: string;
    collateralTokenAddress: string;
    oracleAddress: string;
    irm: string;
    lltv: string;
  } | null;
}

/**
 * Response from fetchMorphoUserPositions
 */
export interface MorphoUserPositionsResponse {
  /** Array of Morpho positions for the user */
  positions: MorphoPositionFromIndexer[];
}

/** GraphQL position item shape */
interface GraphQLPositionItem {
  id: string;
  depositor: string;
  marketId: string;
  proxyContract: string;
  totalCollateral: string;
  status: MorphoPositionStatus;
  createdAt: string;
  updatedAt: string;
  blockNumber: string;
  transactionHash: string;
  market: {
    id: string;
    loanTokenAddress: string;
    collateralTokenAddress: string;
    oracleAddress: string;
    irm: string;
    lltv: string;
  } | null;
}

/** GraphQL collateral item shape */
interface GraphQLCollateralItem {
  id: string;
  positionId: string;
  vaultId: string;
  amount: string;
  addedAt: string;
  removedAt: string | null;
}

/** GraphQL response shape for positions query */
interface GraphQLPositionsResponse {
  morphoPositions: {
    items: GraphQLPositionItem[];
  };
}

/** GraphQL response shape for collaterals query */
interface GraphQLCollateralsResponse {
  morphoPositionCollaterals: {
    items: GraphQLCollateralItem[];
  };
}

const GET_USER_POSITIONS = gql`
  query GetMorphoUserPositions($depositor: String!, $status: String) {
    morphoPositions(where: { depositor: $depositor, status: $status }) {
      items {
        id
        depositor
        marketId
        proxyContract
        totalCollateral
        status
        createdAt
        updatedAt
        blockNumber
        transactionHash
        market {
          id
          loanTokenAddress
          collateralTokenAddress
          oracleAddress
          irm
          lltv
        }
      }
    }
  }
`;

const GET_POSITION_COLLATERALS = gql`
  query GetMorphoPositionCollaterals($positionId: String!) {
    morphoPositionCollaterals(
      where: { positionId: $positionId, removedAt: null }
    ) {
      items {
        id
        positionId
        vaultId
        amount
        addedAt
        removedAt
      }
    }
  }
`;

const GET_POSITION_BY_ID = gql`
  query GetMorphoPositionById($id: String!) {
    morphoPosition(id: $id) {
      id
      depositor
      marketId
      proxyContract
      totalCollateral
      status
      createdAt
      updatedAt
      blockNumber
      transactionHash
      market {
        id
        loanTokenAddress
        collateralTokenAddress
        oracleAddress
        irm
        lltv
      }
    }
  }
`;

/**
 * Maps a GraphQL position item to MorphoPositionFromIndexer
 */
function mapGraphQLPositionToMorphoPosition(
  item: GraphQLPositionItem,
  collaterals?: GraphQLCollateralItem[],
): MorphoPositionFromIndexer {
  return {
    id: item.id,
    depositor: item.depositor,
    marketId: item.marketId,
    proxyContract: item.proxyContract,
    totalCollateral: item.totalCollateral,
    status: item.status,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    blockNumber: item.blockNumber,
    transactionHash: item.transactionHash,
    market: item.market,
    collaterals: collaterals?.map((c) => ({
      id: c.id,
      positionId: c.positionId,
      vaultId: c.vaultId,
      amount: c.amount,
      addedAt: c.addedAt,
      removedAt: c.removedAt,
    })),
  };
}

/**
 * Fetches all positions for a user from the GraphQL indexer.
 *
 * @param depositor - User's Ethereum address (lowercase hex)
 * @param status - Optional status filter ("active", "closed", "liquidated")
 * @returns Object containing array of user's positions with market details
 */
export async function fetchMorphoUserPositions(
  depositor: string,
  status?: MorphoPositionStatus,
): Promise<MorphoUserPositionsResponse> {
  const response = await graphqlClient.request<GraphQLPositionsResponse>(
    GET_USER_POSITIONS,
    {
      depositor: depositor.toLowerCase(),
      status: status || undefined,
    },
  );

  const positions = response.morphoPositions.items.map((item) =>
    mapGraphQLPositionToMorphoPosition(item),
  );

  return { positions };
}

/**
 * Fetches active positions for a user (status = "active").
 * This is the most common query for displaying user positions.
 *
 * @param depositor - User's Ethereum address
 * @returns Object containing array of active positions
 */
export async function fetchMorphoActivePositions(
  depositor: string,
): Promise<MorphoUserPositionsResponse> {
  return fetchMorphoUserPositions(depositor, "active");
}

/**
 * Fetches a specific position by ID with its collateral vaults.
 *
 * @param positionId - The position ID (bytes32 hex string)
 * @returns The position with collaterals if found, null otherwise
 */
export async function fetchMorphoPositionWithCollaterals(
  positionId: string,
): Promise<MorphoPositionFromIndexer | null> {
  const [positionResponse, collateralsResponse] = await Promise.all([
    graphqlClient.request<{ morphoPosition: GraphQLPositionItem | null }>(
      GET_POSITION_BY_ID,
      { id: positionId },
    ),
    graphqlClient.request<GraphQLCollateralsResponse>(
      GET_POSITION_COLLATERALS,
      { positionId },
    ),
  ]);

  if (!positionResponse.morphoPosition) {
    return null;
  }

  return mapGraphQLPositionToMorphoPosition(
    positionResponse.morphoPosition,
    collateralsResponse.morphoPositionCollaterals.items,
  );
}

/**
 * Fetches collateral vaults for a position.
 *
 * @param positionId - The position ID (bytes32 hex string)
 * @returns Array of active collateral items
 */
export async function fetchMorphoPositionCollaterals(
  positionId: string,
): Promise<MorphoPositionCollateralItem[]> {
  const response = await graphqlClient.request<GraphQLCollateralsResponse>(
    GET_POSITION_COLLATERALS,
    { positionId },
  );

  return response.morphoPositionCollaterals.items.map((c) => ({
    id: c.id,
    positionId: c.positionId,
    vaultId: c.vaultId,
    amount: c.amount,
    addedAt: c.addedAt,
    removedAt: c.removedAt,
  }));
}
