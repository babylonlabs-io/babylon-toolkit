import { gql } from "graphql-request";

import { logger } from "@/infrastructure";

import { graphqlClient } from "../../clients/graphql";
import type { UniversalChallenger } from "../../types/vaultProvider";
import {
  BTC_PUBKEY_HEX_PATTERN,
  ETH_ADDRESS_PATTERN,
} from "../../utils/validation";

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

type RawChallengerItem =
  GraphQLUniversalChallengersResponse["universalChallengerVersions"]["items"][number];

function validateChallengerItem(
  item: RawChallengerItem,
): RawChallengerItem | null {
  if (!ETH_ADDRESS_PATTERN.test(item.challengerInfo.id)) {
    logger.warn(
      `[fetchUniversalChallengers] Skipping challenger with invalid id: "${String(item.challengerInfo.id).slice(0, 20)}"`,
    );
    return null;
  }
  if (!BTC_PUBKEY_HEX_PATTERN.test(item.challengerInfo.btcPubKey)) {
    logger.warn(
      `[fetchUniversalChallengers] Skipping challenger ${item.challengerInfo.id}: invalid btcPubKey format`,
    );
    return null;
  }
  return item;
}

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

  const rawItems = response.universalChallengerVersions.items;
  const items = rawItems
    .map(validateChallengerItem)
    .filter((item): item is RawChallengerItem => item !== null);

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
