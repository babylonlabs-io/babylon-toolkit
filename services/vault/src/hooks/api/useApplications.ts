import { useQuery } from "@tanstack/react-query";
import { gql } from "graphql-request";

import { graphqlClient } from "../../clients/graphql/config";
import { getApplicationMetadata } from "../../config/applicationMetadata";
import type { Application, ApplicationsResponse } from "../../types/application";

export const APPLICATIONS_KEY = "applications";

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
 * @returns React Query result with application items array
 */
export const useApplications = () => {
  return useQuery({
    queryKey: [APPLICATIONS_KEY],
    queryFn: async () => {
      const data =
        await graphqlClient.request<ApplicationsResponse>(GET_APPLICATIONS);

      return data.applications.items.map((app: Application) => {
        const metadata = getApplicationMetadata(app.id);

        if (!metadata) {
          return app;
        }

        return {
          ...app,
          name: metadata.name ?? app.name,
          type: metadata.type ?? app.type,
          description: metadata.description ?? app.description,
          logoUrl: metadata.logoUrl ?? app.logoUrl,
          websiteUrl: metadata.websiteUrl ?? app.websiteUrl,
        };
      });
    },
  });
};
