/**
 * Stats Service
 *
 * Fetches global vault statistics from the indexer GraphQL API.
 * The stats table uses a singleton pattern with id="global".
 */

import { gql } from "graphql-request";

import { graphqlClient } from "../../clients/graphql";

/**
 * GraphQL response shape for stats query
 */
interface StatsResponse {
  stats: {
    id: string;
    totalAvailableSats: string;
    availableVaultCount: number;
    updatedAt: string;
  } | null;
}

/**
 * Stats data
 */
export interface Stats {
  /** Total BTC available in vaults (TVL) in satoshis */
  totalAvailableSats: bigint;
  /** Count of available vaults */
  availableVaultCount: number;
}

const GET_STATS = gql`
  query GetStats {
    stats(id: "global") {
      totalAvailableSats
      availableVaultCount
      updatedAt
    }
  }
`;

/**
 * Fetches global vault statistics from the indexer
 */
export async function fetchStats(): Promise<Stats> {
  const data = await graphqlClient.request<StatsResponse>(GET_STATS);

  return {
    totalAvailableSats: BigInt(data.stats?.totalAvailableSats ?? "0"),
    availableVaultCount: data.stats?.availableVaultCount ?? 0,
  };
}
