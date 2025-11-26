import { useQuery } from "@tanstack/react-query";
import { gql } from "graphql-request";

import { graphqlClient } from "../../clients/graphql/config";
import type { ApplicationsResponse } from "../../types/application";

export const APPLICATIONS_KEY = "applications";

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
 * Fetches the list of registered applications from the backend GraphQL API.
 *
 * @returns React Query result with application items array
 */
export const useApplications = () => {
  return useQuery({
    queryKey: [APPLICATIONS_KEY],
    queryFn: async () => {
      const data =
        await graphqlClient.request<ApplicationsResponse>(GET_APPLICATIONS);
      return data.applications.items;
    },
  });
};
