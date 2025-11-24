import { GraphQLClient } from "graphql-request";

import { ENV } from "../../config/env";

export const graphqlClient = new GraphQLClient(ENV.GRAPHQL_ENDPOINT);
