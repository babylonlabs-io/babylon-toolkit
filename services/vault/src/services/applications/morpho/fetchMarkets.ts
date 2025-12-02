/**
 * Morpho Markets Service
 *
 * Fetches Morpho market data from the GraphQL indexer.
 * Markets represent lending pools where VaultBTC can be used as collateral.
 */

import { gql } from "graphql-request";

import { graphqlClient } from "../../../clients/graphql";

/**
 * Token information from GraphQL
 * Matches the token schema in babylon-vault-indexer
 */
export interface MorphoToken {
  /** Token contract address (primary key) */
  address: string;
  /** Token symbol (e.g., "USDC", "vBTC") */
  symbol: string;
  /** Token name (e.g., "USD Coin", "Vault BTC") */
  name: string;
  /** Token decimals (e.g., 6, 8, 18) */
  decimals: number;
}

/**
 * Morpho market information from GraphQL
 * Matches the market schema in babylon-vault-indexer
 */
export interface MorphoMarket {
  /** Market ID (bytes32 hex string) */
  id: string;
  /** Loan token address */
  loanTokenAddress: string;
  /** Collateral token address (VaultBTC) */
  collateralTokenAddress: string;
  /** Oracle address for price feeds */
  oracleAddress: string;
  /** Interest rate model address */
  irm: string;
  /** Liquidation loan-to-value ratio (bigint as string) */
  lltv: string;
  /** Block timestamp when market was created (bigint as string) */
  createdAt: string;
  /** Block number when market was created (bigint as string) */
  blockNumber: string;
  /** Transaction hash when market was created */
  transactionHash: string;
  /** Loan token details (from relation) */
  loanToken: MorphoToken | null;
  /** Collateral token details (from relation) */
  collateralToken: MorphoToken | null;
}

/**
 * Response from fetchMorphoMarkets
 */
export interface MorphoMarketsResponse {
  /** Array of Morpho markets */
  markets: MorphoMarket[];
}

/** GraphQL market item shape */
interface GraphQLMarketItem {
  id: string;
  loanTokenAddress: string;
  collateralTokenAddress: string;
  oracleAddress: string;
  irm: string;
  lltv: string;
  createdAt: string;
  blockNumber: string;
  transactionHash: string;
  loanToken: {
    address: string;
    symbol: string;
    name: string;
    decimals: number;
  } | null;
  collateralToken: {
    address: string;
    symbol: string;
    name: string;
    decimals: number;
  } | null;
}

/** GraphQL response shape for markets query */
interface GraphQLMarketsResponse {
  morphoMarkets: {
    items: GraphQLMarketItem[];
  };
}

/** GraphQL response shape for single market query */
interface GraphQLMarketByIdResponse {
  morphoMarket: GraphQLMarketItem | null;
}

const GET_MORPHO_MARKETS = gql`
  query GetMorphoMarkets {
    morphoMarkets {
      items {
        id
        loanTokenAddress
        collateralTokenAddress
        oracleAddress
        irm
        lltv
        createdAt
        blockNumber
        transactionHash
        loanToken {
          address
          symbol
          name
          decimals
        }
        collateralToken {
          address
          symbol
          name
          decimals
        }
      }
    }
  }
`;

const GET_MORPHO_MARKET_BY_ID = gql`
  query GetMorphoMarketById($id: String!) {
    morphoMarket(id: $id) {
      id
      loanTokenAddress
      collateralTokenAddress
      oracleAddress
      irm
      lltv
      createdAt
      blockNumber
      transactionHash
      loanToken {
        address
        symbol
        name
        decimals
      }
      collateralToken {
        address
        symbol
        name
        decimals
      }
    }
  }
`;

/**
 * Maps a GraphQL market item to MorphoMarket
 */
function mapGraphQLMarketToMorphoMarket(item: GraphQLMarketItem): MorphoMarket {
  return {
    id: item.id,
    loanTokenAddress: item.loanTokenAddress,
    collateralTokenAddress: item.collateralTokenAddress,
    oracleAddress: item.oracleAddress,
    irm: item.irm,
    lltv: item.lltv,
    createdAt: item.createdAt,
    blockNumber: item.blockNumber,
    transactionHash: item.transactionHash,
    loanToken: item.loanToken
      ? {
          address: item.loanToken.address,
          symbol: item.loanToken.symbol,
          name: item.loanToken.name,
          decimals: item.loanToken.decimals,
        }
      : null,
    collateralToken: item.collateralToken
      ? {
          address: item.collateralToken.address,
          symbol: item.collateralToken.symbol,
          name: item.collateralToken.name,
          decimals: item.collateralToken.decimals,
        }
      : null,
  };
}

/**
 * Fetches all Morpho markets from the GraphQL indexer.
 *
 * Uses field resolvers to include loan and collateral token details
 * in a single query.
 *
 * @returns Object containing array of Morpho markets with token details
 */
export async function fetchMorphoMarkets(): Promise<MorphoMarketsResponse> {
  const response =
    await graphqlClient.request<GraphQLMarketsResponse>(GET_MORPHO_MARKETS);

  const markets = response.morphoMarkets.items.map(
    mapGraphQLMarketToMorphoMarket,
  );

  return { markets };
}

/**
 * Fetches a specific Morpho market by ID from the GraphQL indexer.
 *
 * @param marketId - The market ID (bytes32 hex string)
 * @returns The market if found, null otherwise
 */
export async function fetchMorphoMarketById(
  marketId: string,
): Promise<MorphoMarket | null> {
  const response = await graphqlClient.request<GraphQLMarketByIdResponse>(
    GET_MORPHO_MARKET_BY_ID,
    { id: marketId },
  );

  if (!response.morphoMarket) {
    return null;
  }

  return mapGraphQLMarketToMorphoMarket(response.morphoMarket);
}
