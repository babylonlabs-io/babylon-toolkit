import { gql } from "graphql-request";

import { logger } from "@/infrastructure";

import { getApplicationMetadataByController } from "../../applications";
import { graphqlClient } from "../../clients/graphql";
import type { Application } from "../../types/application";
import { ETH_ADDRESS_PATTERN } from "../../utils/validation";

/**
 * GraphQL response shape for applications query
 */
interface GraphQLApplicationsResponse {
  applications: {
    items: Array<{
      id: string;
      name: string | null;
      registeredAt: string;
      blockNumber: string;
      transactionHash: string;
    }>;
  };
}

const GET_APPLICATIONS = gql`
  query GetApplications {
    applications {
      items {
        id
        name
        registeredAt
        blockNumber
        transactionHash
      }
    }
  }
`;

/**
 * Fetches the list of registered applications from the backend GraphQL API
 * and enriches them with metadata from the local registry.
 *
 * Only returns applications that have metadata in the registry.
 *
 * @returns Array of application items with enriched metadata
 */
export async function fetchApplications(): Promise<Application[]> {
  const data =
    await graphqlClient.request<GraphQLApplicationsResponse>(GET_APPLICATIONS);

  return data.applications.items
    .map((app): Application | null => {
      if (!ETH_ADDRESS_PATTERN.test(app.id)) {
        logger.warn(
          `[fetchApplications] Skipping application with invalid id: "${String(app.id).slice(0, 20)}"`,
        );
        return null;
      }
      const metadata = getApplicationMetadataByController(app.id);
      if (!metadata) {
        logger.warn(
          `Application ${app.id} has no metadata in registry, skipping`,
        );
        return null;
      }

      return {
        id: app.id,
        registeredAt: app.registeredAt,
        blockNumber: app.blockNumber,
        transactionHash: app.transactionHash,
        // Use indexer name, fall back to registry if null
        name: app.name ?? metadata.name,
        type: metadata.type,
        description: metadata.description,
        logoUrl: metadata.logoUrl,
        websiteUrl: metadata.websiteUrl,
      };
    })
    .filter((app): app is Application => app !== null);
}
