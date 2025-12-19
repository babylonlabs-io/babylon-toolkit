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
    totalAvailableBtc: string;
    totalCollateralBtc: string;
    totalLoanAmount: string;
    updatedAt: string;
  } | null;
}

/**
 * Stats data with bigint values (satoshis)
 */
export interface Stats {
  /** Total BTC in vaults with "available" status (TVL in TBV protocol) */
  totalAvailableBtc: bigint;
  /** Total BTC used as collateral across all apps (available + in_use) */
  totalCollateralBtc: bigint;
  /** Sum of outstanding loan amounts against vaultBTC collateral */
  totalLoanAmount: bigint;
  /** Last update timestamp */
  updatedAt: bigint;
}

const GET_STATS = gql`
  query GetStats {
    stats(id: "global") {
      totalAvailableBtc
      totalCollateralBtc
      totalLoanAmount
      updatedAt
    }
  }
`;

/**
 * Fetches global vault statistics from the indexer
 *
 * @returns Stats object with bigint values in satoshis
 */
export async function fetchStats(): Promise<Stats> {
  const data = await graphqlClient.request<StatsResponse>(GET_STATS);

  return {
    totalAvailableBtc: BigInt(data.stats?.totalAvailableBtc ?? "0"),
    totalCollateralBtc: BigInt(data.stats?.totalCollateralBtc ?? "0"),
    totalLoanAmount: BigInt(data.stats?.totalLoanAmount ?? "0"),
    updatedAt: BigInt(data.stats?.updatedAt ?? "0"),
  };
}
