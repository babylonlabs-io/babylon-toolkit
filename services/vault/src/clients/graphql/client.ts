import { GraphQLClient } from "graphql-request";

import { ENV } from "../../config/env";

/** Timeout for GraphQL API requests — prevents indefinite hangs from stalled endpoints */
const GRAPHQL_REQUEST_TIMEOUT_MS = 30_000;

export const graphqlClient = new GraphQLClient(ENV.GRAPHQL_ENDPOINT, {
  fetch: async (url, options) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      GRAPHQL_REQUEST_TIMEOUT_MS,
    );

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      // Check name directly — DOMException from Node.js built-in fetch may fail
      // cross-realm instanceof checks in jsdom environments
      if (
        error != null &&
        typeof error === "object" &&
        "name" in error &&
        error.name === "AbortError"
      ) {
        throw new Error(
          `GraphQL request timed out after ${GRAPHQL_REQUEST_TIMEOUT_MS}ms`,
        );
      }
      throw error;
    }
  },
});
