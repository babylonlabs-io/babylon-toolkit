/**
 * Aave Reserves Fetch Service
 *
 * Fetches reserve data from the GraphQL indexer.
 * Reserves represent assets that can be borrowed against vBTC collateral.
 */

import { gql } from "graphql-request";

import { graphqlClient } from "../../../clients/graphql";

/**
 * Aave reserve from GraphQL indexer
 */
export interface AaveReserve {
  /** Reserve ID */
  id: bigint;
  /** Underlying token address */
  underlying: string;
  /** Hub contract address */
  hub: string;
  /** Asset ID */
  assetId: number;
  /** Token decimals */
  decimals: number;
  /** Dynamic config key */
  dynamicConfigKey: number;
  /** Whether reserve is paused */
  paused: boolean;
  /** Whether reserve is frozen */
  frozen: boolean;
  /** Whether reserve is borrowable */
  borrowable: boolean;
  /** Collateral risk parameter */
  collateralRisk: number;
  /** Token metadata (from relation) */
  underlyingToken: {
    address: string;
    symbol: string;
    name: string;
    decimals: number;
  } | null;
}

/** GraphQL response shape */
interface GraphQLReserveResponse {
  aaveReserve: {
    id: string;
    underlying: string;
    hub: string;
    assetId: number;
    decimals: number;
    dynamicConfigKey: number;
    paused: boolean;
    frozen: boolean;
    borrowable: boolean;
    collateralRisk: number;
    underlyingToken: {
      address: string;
      symbol: string;
      name: string;
      decimals: number;
    } | null;
  } | null;
}

interface GraphQLReservesResponse {
  aaveReserves: {
    items: Array<{
      id: string;
      underlying: string;
      hub: string;
      assetId: number;
      decimals: number;
      dynamicConfigKey: number;
      paused: boolean;
      frozen: boolean;
      borrowable: boolean;
      collateralRisk: number;
      underlyingToken: {
        address: string;
        symbol: string;
        name: string;
        decimals: number;
      } | null;
    }>;
  };
}

const RESERVE_FRAGMENT = gql`
  fragment ReserveFields on aaveReserve {
    id
    underlying
    hub
    assetId
    decimals
    dynamicConfigKey
    paused
    frozen
    borrowable
    collateralRisk
    underlyingToken {
      address
      symbol
      name
      decimals
    }
  }
`;

const GET_RESERVE_BY_ID = gql`
  ${RESERVE_FRAGMENT}
  query GetAaveReserve($id: BigInt!) {
    aaveReserve(id: $id) {
      ...ReserveFields
    }
  }
`;

const GET_ALL_RESERVES = gql`
  ${RESERVE_FRAGMENT}
  query GetAllAaveReserves {
    aaveReserves {
      items {
        ...ReserveFields
      }
    }
  }
`;

const GET_BORROWABLE_RESERVES = gql`
  ${RESERVE_FRAGMENT}
  query GetBorrowableReserves {
    aaveReserves(where: { borrowable: true, paused: false, frozen: false }) {
      items {
        ...ReserveFields
      }
    }
  }
`;

function mapReserve(
  raw: GraphQLReservesResponse["aaveReserves"]["items"][0]
): AaveReserve {
  return {
    id: BigInt(raw.id),
    underlying: raw.underlying,
    hub: raw.hub,
    assetId: raw.assetId,
    decimals: raw.decimals,
    dynamicConfigKey: raw.dynamicConfigKey,
    paused: raw.paused,
    frozen: raw.frozen,
    borrowable: raw.borrowable,
    collateralRisk: raw.collateralRisk,
    underlyingToken: raw.underlyingToken,
  };
}

/**
 * Fetch a reserve by ID from the indexer
 *
 * @param reserveId - Reserve ID
 * @returns Reserve data or null if not found
 */
export async function fetchAaveReserveById(
  reserveId: bigint
): Promise<AaveReserve | null> {
  const response = await graphqlClient.request<GraphQLReserveResponse>(
    GET_RESERVE_BY_ID,
    { id: reserveId.toString() }
  );

  if (!response.aaveReserve) {
    return null;
  }

  return mapReserve(response.aaveReserve);
}

/**
 * Fetch all reserves from the indexer
 *
 * @returns Array of all reserves
 */
export async function fetchAllAaveReserves(): Promise<AaveReserve[]> {
  const response =
    await graphqlClient.request<GraphQLReservesResponse>(GET_ALL_RESERVES);

  return response.aaveReserves.items.map(mapReserve);
}

/**
 * Fetch borrowable reserves from the indexer
 * (reserves that are borrowable, not paused, and not frozen)
 *
 * @returns Array of borrowable reserves
 */
export async function fetchBorrowableAaveReserves(): Promise<AaveReserve[]> {
  const response = await graphqlClient.request<GraphQLReservesResponse>(
    GET_BORROWABLE_RESERVES
  );

  return response.aaveReserves.items.map(mapReserve);
}
