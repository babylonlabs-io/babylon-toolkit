import { GraphQLClient } from "graphql-request";

import { ENV } from "../../config/env";
import { withRequestTimeout } from "../../utils/async";

/** Timeout for GraphQL API requests — prevents indefinite hangs from stalled endpoints */
const GRAPHQL_REQUEST_TIMEOUT_MS = 30_000;

export const graphqlClient = new GraphQLClient(ENV.GRAPHQL_ENDPOINT, {
  fetch: async (url, options) =>
    withRequestTimeout(
      {
        timeoutMs: GRAPHQL_REQUEST_TIMEOUT_MS,
        signal: options?.signal ?? undefined,
        requestLabel: "GraphQL request",
        url: String(url),
      },
      async (composedSignal) => {
        const response = await fetch(url, {
          ...options,
          signal: composedSignal,
        });
        const body = await response.text();
        return new Response(body, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      },
    ),
});
