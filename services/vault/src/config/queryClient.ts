import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";

import { logger } from "@/infrastructure";
import { isUserCancellation } from "@/utils/errors/userCancellation";

const calculateRetryDelay = (attemptIndex: number): number => {
  return Math.min(1000 * 2 ** attemptIndex, 30000);
};

/**
 * HTTP statuses that will not change by trying again with the same request.
 * 451 is the one that hurt in production: a geo-block made every poll cycle
 * issue four doomed requests, and two independent 30s-interval queries then
 * alternated for over an hour, each settled failure billing a Sentry issue.
 * 408 and 429 stay retryable.
 *
 * 501 is here deliberately. It is 5xx by number but it means "this server does
 * not implement this operation", which no amount of retrying changes.
 */
const NON_RETRYABLE_HTTP_STATUSES = new Set([
  400, 401, 403, 404, 410, 451, 501,
]);

/**
 * Statuses that are also not worth a standalone Sentry issue.
 *
 * Deliberately narrower than {@link NON_RETRYABLE_HTTP_STATUSES}: not retrying
 * and not reporting are different decisions. A geo-block (451) is a property of
 * where the user is and repeats every poll for the rest of the session, so it
 * is breadcrumbed. Everything else - a 400 from a malformed query, a 501 from a
 * frontend/backend version skew - is a real defect someone should see, so it
 * still reaches `logger.error` even though it is never retried.
 */
const UNREPORTABLE_HTTP_STATUSES = new Set([451]);

/**
 * Pull an HTTP status off the error shapes that actually reach this handler:
 * graphql-request's `ClientError` (`response.status`) and viem's
 * `HttpRequestError` (`status`).
 *
 * Note the app's own `ApiError` does NOT reach here - every throw site is
 * caught inside `healthCheckService`.
 */
const httpStatusOf = (error: unknown): number | undefined => {
  if (!error || typeof error !== "object") return undefined;

  const { status, response } = error as {
    status?: unknown;
    response?: { status?: unknown };
  };
  if (typeof status === "number") return status;
  if (typeof response?.status === "number") return response.status;
  return undefined;
};

const isNonRetryableHttpError = (error: unknown): boolean => {
  const status = httpStatusOf(error);
  return status !== undefined && NON_RETRYABLE_HTTP_STATUSES.has(status);
};

const shouldRetry = (failureCount: number, error: Error): boolean => {
  if (failureCount >= 3) {
    return false;
  }

  if (isNonRetryableHttpError(error)) {
    return false;
  }

  if (isUserCancellation(error)) {
    return false;
  }

  // Kept deliberately broad for the retry decision only: any rejection wording
  // (including a deterministic contract rejection, which `isUserCancellation`
  // intentionally does not match) reproduces on retry, so re-sending is waste.
  if (error.message?.includes("rejected")) {
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

  // An unreportable status is a property of where the user is, not a fault we
  // can act on, and it repeats on every poll for the rest of the session.
  // Recorded as a breadcrumb so it still attaches to any genuine error captured
  // later. Note this set is NOT the non-retryable set: a 400 or 501 is equally
  // pointless to retry but is a real defect, so it falls through to
  // `logger.error` below.
  const status = httpStatusOf(error);
  if (status !== undefined && UNREPORTABLE_HTTP_STATUSES.has(status)) {
    logger.warn(`Unreportable ${kind.toLowerCase()} failure: HTTP ${status}`, {
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
