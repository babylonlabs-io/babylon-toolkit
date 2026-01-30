import { gql } from "graphql-request";

import { graphqlClient } from "../../clients/graphql";
import type { UniversalChallenger } from "../../types/vaultProvider";

/** GraphQL response for universal challengers query */
interface GraphQLUniversalChallengersResponse {
  universalChallengerVersions: {
    items: Array<{
      version: number;
      challengerInfo: {
        id: string;
        btcPubKey: string;
      };
    }>;
  };
}

const GET_UNIVERSAL_CHALLENGERS = gql`
  query GetUniversalChallengers {
    universalChallengerVersions {
      items {
        version
        challengerInfo {
          id
          btcPubKey
        }
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
  const response =
    await graphqlClient.request<GraphQLUniversalChallengersResponse>(
      GET_UNIVERSAL_CHALLENGERS,
    );

  const items = response.universalChallengerVersions.items;

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
