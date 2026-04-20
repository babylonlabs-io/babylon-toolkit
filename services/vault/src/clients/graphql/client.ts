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
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.any(signals),
      });
      const body = await response.text();
      clearTimeout(timeoutId);
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
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
