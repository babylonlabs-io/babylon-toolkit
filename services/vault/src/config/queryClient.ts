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

const logError = (error: Error, context?: string): void => {
  const errorContext = context ? `[${context}]` : "";
  logger.error(error, {
    data: { context: `React Query Error ${errorContext}` },
  });
};

export const createQueryClient = (): QueryClient => {
  const queryCache = new QueryCache({
    onError: (error) => {
      logError(error, "Query");
    },
  });

  const mutationCache = new MutationCache({
    onError: (error) => {
      logError(error, "Mutation");
    },
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
