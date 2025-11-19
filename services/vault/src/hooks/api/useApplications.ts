import { useQuery } from "@tanstack/react-query";
import { gql } from "graphql-request";

import { graphqlClient } from "../../clients/graphql/config";
import type { ApplicationsResponse } from "../../types/application";

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

export const useApplications = () => {
  return useQuery({
    queryKey: ["applications"],
    queryFn: async () => {
      const data =
        await graphqlClient.request<ApplicationsResponse>(GET_APPLICATIONS);
      return data.applications.items;
    },
  });
};

