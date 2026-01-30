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

/**
 * Fetches universal challengers (system-wide).
 *
 * Universal challengers are protocol-level participants that are the same
 * across all applications. They rarely change and should be fetched once
 * at app initialization.
 *
 * Only returns challengers from the latest version, as that's what the
 * contract validates against during peg-in.
 *
 * @returns Array of universal challengers from the latest version
 */
export async function fetchUniversalChallengers(): Promise<
  UniversalChallenger[]
> {
  const response =
    await graphqlClient.request<GraphQLUniversalChallengersResponse>(
      GET_UNIVERSAL_CHALLENGERS,
    );

  const items = response.universalChallengerVersions.items;

  if (items.length === 0) {
    return [];
  }

  // Find the latest version
  const latestVersion = Math.max(...items.map((item) => item.version));

  // Return only challengers from the latest version
  return items
    .filter((item) => item.version === latestVersion)
    .map((item) => ({
      id: item.challengerInfo.id,
      btcPubKey: item.challengerInfo.btcPubKey,
    }));
}
