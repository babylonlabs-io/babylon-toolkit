import { gql } from "graphql-request";

import { graphqlClient } from "../../clients/graphql";
import { getApplicationMetadata } from "../../registry";
import type {
  Application,
  ApplicationsResponse,
} from "../../types/application";

const GET_APPLICATIONS = gql`
  query GetApplications {
    applications {
      items {
        id
        name
        type
        description
        logoUrl
        websiteUrl
        registeredAt
      }
    }
  }
`;

/**
 * Fetches the list of registered applications from the backend GraphQL API
 * and enriches them with hardcoded metadata when available.
 *
 * @returns Array of application items
 */
export async function fetchApplications(): Promise<Application[]> {
  const data =
    await graphqlClient.request<ApplicationsResponse>(GET_APPLICATIONS);

  return data.applications.items.map((app: Application) => {
    const metadata = getApplicationMetadata(app.id);

    if (!metadata) {
      return app;
    }

    return {
      ...app,
      name: metadata.name,
      type: metadata.type,
      description: metadata.description,
      logoUrl: metadata.logoUrl,
      websiteUrl: metadata.websiteUrl,
    };
  });
}
