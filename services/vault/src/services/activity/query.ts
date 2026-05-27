/**
 * GraphQL query layer for the Activity tab.
 *
 * Owns the wire types, the two query documents (first page + cursor-paged
 * next pages), and the `fetchAllActivityPages` helper that walks Ponder's
 * cursor pagination until exhausted.
 *
 * Everything in this file is indexer-shape concerns; projection / display
 * concerns live in `projection.ts` and grouping in `classification.ts`.
 */

import { gql } from "graphql-request";

import { graphqlClient } from "../../clients/graphql";
import { logger } from "../../infrastructure";

export type GraphQLActivityType =
  | "deposit"
  | "withdrawal"
  | "liquidation"
  | "borrow"
  | "repay"
  | "redeem"
  | "claim_expired";

export interface GraphQLVaultActivityItem {
  id: string;
  vaultId: string | null;
  depositor: string;
  type: GraphQLActivityType;
  amount: string;
  debtReserveId: string | null;
  timestamp: string;
  blockNumber: string;
  transactionHash: string;
}

export interface GraphQLVaultItem {
  id: string;
  peginTxHash: string;
}

interface GraphQLPageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

interface GraphQLActivityFirstPageResponse {
  vaultActivitys: {
    items: GraphQLVaultActivityItem[];
    pageInfo: GraphQLPageInfo;
  };
  vaults: { items: GraphQLVaultItem[] };
}

interface GraphQLActivityNextPageResponse {
  vaultActivitys: {
    items: GraphQLVaultActivityItem[];
    pageInfo: GraphQLPageInfo;
  };
}

/**
 * Ponder caps a single GraphQL page at 1000 items. We request the max so most
 * users complete in one round trip — the loop only fires for genuine power
 * users with multi-thousand activity histories.
 */
const ACTIVITIES_PAGE_SIZE = 1000;

/**
 * Hard cap on pagination depth as a runaway guard. 50 × 1000 = 50,000
 * activities for a single depositor — well beyond any realistic ceiling.
 * Hitting this means either the indexer is in a bad state or our query
 * predicate has stopped narrowing; either way we want to surface it loudly
 * rather than spin forever.
 */
const MAX_ACTIVITY_PAGES = 50;

/**
 * The indexer encodes logIndex into the activity id as
 * `${transactionHash}-${logIndex}-${type}`. Parse it out for deterministic
 * same-tx ordering without requiring a dedicated column.
 */
export function parseLogIndex(id: string): number {
  const parts = id.split("-");
  // parts[0] is transactionHash; parts[1] is logIndex.
  const n = Number.parseInt(parts[1] ?? "", 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * First page: pulls activity rows AND (in the same round trip) the vault rows
 * referenced by those activities for pegin-hash resolution. The frontend joins
 * on `vault.id` client-side.
 *
 * `vaults` is fetched once because it's bounded by the user's deposits (small
 * by construction), so it does not need its own pagination loop.
 */
const GET_ACTIVITIES_FIRST_PAGE = gql`
  query GetActivitiesFirstPage($depositor: String!, $limit: Int!) {
    vaultActivitys(
      where: { depositor: $depositor }
      orderBy: "timestamp"
      orderDirection: "desc"
      limit: $limit
    ) {
      items {
        id
        vaultId
        depositor
        type
        amount
        debtReserveId
        timestamp
        blockNumber
        transactionHash
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
    vaults(where: { depositor: $depositor }) {
      items {
        id
        peginTxHash
      }
    }
  }
`;

/**
 * Follow-on pages: same activity rows query without the (already fetched)
 * vaults selection. Cursor comes from the previous page's `pageInfo.endCursor`.
 */
const GET_ACTIVITIES_NEXT_PAGE = gql`
  query GetActivitiesNextPage(
    $depositor: String!
    $limit: Int!
    $after: String!
  ) {
    vaultActivitys(
      where: { depositor: $depositor }
      orderBy: "timestamp"
      orderDirection: "desc"
      limit: $limit
      after: $after
    ) {
      items {
        id
        vaultId
        depositor
        type
        amount
        debtReserveId
        timestamp
        blockNumber
        transactionHash
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

/**
 * Walk Ponder's cursor pagination until the indexer reports no more pages.
 *
 * Returns the full materialised list of activities for the depositor along
 * with the (one-shot) vaults selection from the first page. Both are needed
 * by the classifier before any row can be projected.
 */
export async function fetchAllActivityPages(depositor: string): Promise<{
  activities: GraphQLVaultActivityItem[];
  vaults: GraphQLVaultItem[];
}> {
  const firstPage =
    await graphqlClient.request<GraphQLActivityFirstPageResponse>(
      GET_ACTIVITIES_FIRST_PAGE,
      { depositor, limit: ACTIVITIES_PAGE_SIZE },
    );

  const activities: GraphQLVaultActivityItem[] = [
    ...firstPage.vaultActivitys.items,
  ];
  let { hasNextPage, endCursor } = firstPage.vaultActivitys.pageInfo;
  let pagesFetched = 1;

  while (hasNextPage && endCursor != null) {
    if (pagesFetched >= MAX_ACTIVITY_PAGES) {
      logger.warn(
        "[fetchActivities] hit MAX_ACTIVITY_PAGES while paginating; results may be truncated",
        { depositor, pagesFetched, accumulated: activities.length },
      );
      break;
    }
    const nextPage =
      await graphqlClient.request<GraphQLActivityNextPageResponse>(
        GET_ACTIVITIES_NEXT_PAGE,
        { depositor, limit: ACTIVITIES_PAGE_SIZE, after: endCursor },
      );
    activities.push(...nextPage.vaultActivitys.items);
    hasNextPage = nextPage.vaultActivitys.pageInfo.hasNextPage;
    endCursor = nextPage.vaultActivitys.pageInfo.endCursor;
    pagesFetched += 1;
  }

  return { activities, vaults: firstPage.vaults.items };
}
