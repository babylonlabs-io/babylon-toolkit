import { gql } from "graphql-request";

import { graphqlClient } from "../../clients/graphql";
import type { UniversalChallenger } from "../../types/vaultProvider";

import {
  IncompleteRosterError,
  MAX_ROSTER_PAGES,
  ROSTER_PAGE_SIZE,
} from "./rosterPagination";

interface GraphQLPageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

interface GraphQLUniversalChallengerItem {
  version: number;
  challengerInfo: {
    id: string;
    btcPubKey: string;
  };
}

/** GraphQL response for universal challengers query */
interface GraphQLUniversalChallengersResponse {
  universalChallengerVersions: {
    items: GraphQLUniversalChallengerItem[];
    pageInfo: GraphQLPageInfo;
  };
}

const GET_UNIVERSAL_CHALLENGERS_FIRST_PAGE = gql`
  query GetUniversalChallengersFirstPage($limit: Int!) {
    universalChallengerVersions(limit: $limit) {
      items {
        version
        challengerInfo {
          id
          btcPubKey
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const GET_UNIVERSAL_CHALLENGERS_NEXT_PAGE = gql`
  query GetUniversalChallengersNextPage($limit: Int!, $after: String!) {
    universalChallengerVersions(limit: $limit, after: $after) {
      items {
        version
        challengerInfo {
          id
          btcPubKey
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

/** Result from fetchAllUniversalChallengers */
export interface UniversalChallengersData {
  /** All challengers grouped by version */
  byVersion: Map<number, UniversalChallenger[]>;
  /** The latest version number */
  latestVersion: number;
}

/**
 * Fetches all universal challengers grouped by version.
 *
 * Universal challengers are protocol-level participants that are the same
 * across all applications. They rarely change and should be fetched once
 * at app initialization.
 *
 * Returns all versions so that:
 * - New peg-ins use the latest version
 * - Payout signing can lookup by vault's locked version
 *
 * @returns Object with challengers grouped by version and the latest version number
 */
export async function fetchAllUniversalChallengers(): Promise<UniversalChallengersData> {
  const firstPage =
    await graphqlClient.request<GraphQLUniversalChallengersResponse>(
      GET_UNIVERSAL_CHALLENGERS_FIRST_PAGE,
      { limit: ROSTER_PAGE_SIZE },
    );

  const items = [...firstPage.universalChallengerVersions.items];
  let pageInfo = firstPage.universalChallengerVersions.pageInfo;
  let pagesFetched = 1;

  while (pageInfo.hasNextPage) {
    if (!pageInfo.endCursor) {
      throw new IncompleteRosterError(
        `[fetchAllUniversalChallengers] Indexer reported another challenger ` +
          `page without a cursor after page ${pagesFetched}; refusing to ` +
          `return an incomplete roster`,
      );
    }
    if (pagesFetched >= MAX_ROSTER_PAGES) {
      throw new IncompleteRosterError(
        `[fetchAllUniversalChallengers] Challenger roster exceeds ` +
          `${MAX_ROSTER_PAGES * ROSTER_PAGE_SIZE} rows; refusing to return ` +
          `an incomplete roster`,
      );
    }

    const nextPage =
      await graphqlClient.request<GraphQLUniversalChallengersResponse>(
        GET_UNIVERSAL_CHALLENGERS_NEXT_PAGE,
        { limit: ROSTER_PAGE_SIZE, after: pageInfo.endCursor },
      );
    items.push(...nextPage.universalChallengerVersions.items);
    pageInfo = nextPage.universalChallengerVersions.pageInfo;
    pagesFetched += 1;
  }

  if (items.length === 0) {
    return { byVersion: new Map(), latestVersion: 0 };
  }

  // Group challengers by version
  const byVersion = new Map<number, UniversalChallenger[]>();
  let latestVersion = 0;

  for (const item of items) {
    const version = item.version;
    if (version > latestVersion) {
      latestVersion = version;
    }

    const challenger: UniversalChallenger = {
      id: item.challengerInfo.id,
      btcPubKey: item.challengerInfo.btcPubKey,
    };

    const existing = byVersion.get(version);
    if (existing) {
      existing.push(challenger);
    } else {
      byVersion.set(version, [challenger]);
    }
  }

  return { byVersion, latestVersion };
}
