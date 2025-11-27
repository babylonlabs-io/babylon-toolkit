import { gql } from "graphql-request";

import { graphqlClient } from "../../clients/graphql";
import { getApplicationMetadata } from "../../registry";
import type { Application } from "../../types/application";

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
    .map((app) => {
      const metadata = getApplicationMetadata(app.id);
      if (!metadata) return null;

      return {
        ...app,
        name: metadata.name,
        type: metadata.type,
        description: metadata.description,
        logoUrl: metadata.logoUrl,
        websiteUrl: metadata.websiteUrl,
      };
    })
    .filter((app): app is Application => app !== null);
}
