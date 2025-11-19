import { GraphQLClient } from "graphql-request";

const GRAPHQL_ENDPOINT =
  import.meta.env.VITE_GRAPHQL_ENDPOINT || "http://localhost:42069/";

export const graphqlClient = new GraphQLClient(GRAPHQL_ENDPOINT, {
  headers: {},
});

