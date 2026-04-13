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

    // Compose timeout signal with any caller-supplied signal so both can cancel
    const signals = [controller.signal, options?.signal].filter(
      Boolean,
    ) as AbortSignal[];

    try {
      // Don't clear timeout — graphql-request parses body after this returns
      return await fetch(url, {
        ...options,
        signal: AbortSignal.any(signals),
      });
    } catch (error) {
      clearTimeout(timeoutId);
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
