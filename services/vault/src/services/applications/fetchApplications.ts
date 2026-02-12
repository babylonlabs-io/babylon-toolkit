import { gql } from "graphql-request";

import { getApplicationMetadataByController } from "../../applications";
import { graphqlClient } from "../../clients/graphql";
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
  // TODO: REMOVE - temporary hardcoded data for testing mnemonic flow
  return [
    {
      id: "0x0000000000000000000000000000000000000001",
      name: "Test Lending App",
      registeredAt: "1700000000",
      blockNumber: "1",
      transactionHash: "0x01",
      type: "Lending",
      description: null,
      logoUrl: null,
      websiteUrl: null,
    },
  ];

  const data =
    await graphqlClient.request<GraphQLApplicationsResponse>(GET_APPLICATIONS);

  return data.applications.items
    .map((app): Application | null => {
      const metadata = getApplicationMetadataByController(app.id);
      if (!metadata) {
        console.warn(
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
