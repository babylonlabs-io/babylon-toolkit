import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";

import { logger } from "@/infrastructure";

const calculateRetryDelay = (attemptIndex: number): number => {
  return Math.min(1000 * 2 ** attemptIndex, 30000);
};

const shouldRetry = (failureCount: number, error: Error): boolean => {
  if (failureCount >= 3) {
    return false;
  }

  if (error.message?.includes("rejected")) {
    return false;
  }

  if (error.message?.includes("User rejected")) {
    return false;
  }

  return true;
};

/**
 * Query errors that reflect an expected, non-actionable condition rather than a
 * fault — e.g. an optional API not configured in this environment. Recorded as
 * a breadcrumb (so they still attach to any genuine error captured afterwards)
 * instead of a standalone Sentry issue, so they don't drown the signal. This
 * onError handler fires for EVERY query failure, so an unfiltered logger.error
 * here turns any transient blip into a captured issue. Matched by error name so
 * the match survives bundling across the wallet-connector package boundary.
 */
const EXPECTED_QUERY_ERROR_NAMES = new Set<string>([
  // The wallet-connector ordinals hook throws this when inscription filtering
  // has no data source (no ordinalsApiUrl configured). The vault already treats
  // missing ordinals data as non-fatal (every UTXO available, see useUTXOs), so
  // it is an expected environment condition, not a captured error.
  "OrdinalsClassifierUnavailableError",
]);

export function isExpectedQueryError(error: Error): boolean {
  return EXPECTED_QUERY_ERROR_NAMES.has(error.name);
}

export function reportQueryCacheError(
  error: Error,
  kind: "Query" | "Mutation",
): void {
  if (isExpectedQueryError(error)) {
    logger.warn(`Expected ${kind.toLowerCase()} condition: ${error.name}`, {
      detail: error.message,
    });
    return;
  }
  logger.error(error, {
    data: { context: `React Query Error [${kind}]` },
  });
}

export const createQueryClient = (): QueryClient => {
  const queryCache = new QueryCache({
    onError: (error) => reportQueryCacheError(error, "Query"),
  });

  const mutationCache = new MutationCache({
    onError: (error) => reportQueryCacheError(error, "Mutation"),
  });

  return new QueryClient({
    queryCache,
    mutationCache,
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          return shouldRetry(failureCount, error as Error);
        },
        retryDelay: calculateRetryDelay,
        staleTime: 60000,
        gcTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
      mutations: {
        retry: (failureCount, error) => {
          return shouldRetry(failureCount, error as Error);
        },
        retryDelay: calculateRetryDelay,
      },
    },
  });
};
