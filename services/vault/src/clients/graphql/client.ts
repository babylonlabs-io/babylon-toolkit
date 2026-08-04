import { GraphQLClient } from "graphql-request";

import { ENV } from "../../config/env";
import { combineAbortSignals } from "../../utils/async";

/** Timeout for GraphQL API requests — prevents indefinite hangs from stalled endpoints */
const GRAPHQL_REQUEST_TIMEOUT_MS = 30_000;

/**
 * A browser `fetch` rejection carries no endpoint information — the exception is
 * literally `TypeError: Failed to fetch` (`Load failed` on Safari), so every
 * failing query in the app produces an identical, untriageable Sentry issue.
 * Naming the host restores enough context to tell an indexer outage apart from
 * an RPC or mempool one, without leaking the query or its variables.
 */
function describeFetchFailure(url: string, error: unknown): Error {
  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return "unknown host";
    }
  })();
  const detail = error instanceof Error ? error.message : String(error);
  return new Error(`GraphQL request to ${host} failed: ${detail}`, {
    cause: error,
  });
}

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
    const combined = combineAbortSignals(signals);

    try {
      const response = await fetch(url, {
        ...options,
        signal: combined.signal,
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
        controller.signal.aborted &&
        error != null &&
        typeof error === "object" &&
        "name" in error &&
        error.name === "AbortError"
      ) {
        throw new Error(
          `GraphQL request timed out after ${GRAPHQL_REQUEST_TIMEOUT_MS}ms`,
        );
      }
      // A caller-initiated abort (React Query unmount) must stay an AbortError
      // so downstream `name === "AbortError"` checks keep treating it as a
      // cancellation rather than a fault.
      if (
        error != null &&
        typeof error === "object" &&
        "name" in error &&
        error.name === "AbortError"
      ) {
        throw error;
      }
      throw describeFetchFailure(String(url), error);
    } finally {
      combined.cleanup();
    }
  },
});
