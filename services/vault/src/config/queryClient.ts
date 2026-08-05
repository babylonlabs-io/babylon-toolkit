import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";

import { logger } from "@/infrastructure";
import {
  HTTP_GEO_BLOCKED,
  httpStatusOf,
  isError451,
} from "@/utils/errors/types";
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
 *
 * Deliberately narrow. 401/403/404 are NOT here, because on this app's
 * endpoints they are routinely transient: a just-broadcast transaction is not
 * indexed yet, a subgraph is mid-redeploy, an RPC provider returns 401/403 for
 * a rate limit or an edge condition, and a rotated key clears its own 401.
 * The in-fetch retries are what bridge that propagation lag. This predicate
 * also governs mutations, so a status added here stops retrying ETH
 * submissions too.
 */
const NON_RETRYABLE_HTTP_STATUSES = new Set([400, 410, 451, 501]);

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

  // Kept deliberately broad for the retry decision only: any rejection wording
  // (including a deterministic contract rejection, which `isUserCancellation`
  // intentionally does not match) reproduces on retry, so re-sending is waste.
  if (isUserCancellation(error) || error.message?.includes("rejected")) {
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

/**
 * Whether this session has already reported the geo-block.
 *
 * A 451 is a property of where the user is: it repeats on every poll for the
 * rest of the session and nothing the user does clears it. Reporting each
 * settled query was what billed an issue per failure; breadcrumbing it instead
 * went too far the other way, because a breadcrumb only ships if some *other*
 * error is captured in the same session — so a geo-blocked user got a broken
 * app and we learned nothing. Worse, two 30s-interval queries at four requests
 * per cycle evict Sentry's 100-breadcrumb buffer in about 25 minutes, taking
 * the surrounding context with them.
 *
 * One captured event per session is the middle: the geo-block stays visible
 * while the volume stays flat. Module scope, so it resets with the page.
 */
let geoBlockReported = false;

/** Reset the once-per-session geo-block latch. Test seam only. */
export function resetGeoBlockReportingForTests(): void {
  geoBlockReported = false;
}

export function reportQueryCacheError(
  error: Error,
  kind: "Query" | "Mutation",
  source?: string,
): void {
  if (isExpectedQueryError(error)) {
    logger.warn(`Expected ${kind.toLowerCase()} condition: ${error.name}`, {
      detail: error.message,
    });
    return;
  }

  // Note this is NOT the non-retryable set: a 400 or 501 is equally pointless
  // to retry but is a real defect, so it falls through to `logger.error` below.
  if (isError451(error)) {
    if (!geoBlockReported) {
      geoBlockReported = true;
      // Deliberately no `error.message`: a graphql-request `ClientError`
      // stringifies the whole response *and* request, so the message can carry
      // query variables (BTC/ETH addresses). The status plus the query key is
      // smaller and safer, and `scrubString` is then a backstop rather than the
      // only thing standing between us and an address in telemetry.
      logger.event("Geo-blocked data plane (HTTP 451)", {
        level: "warning",
        tags: { httpStatus: String(HTTP_GEO_BLOCKED), kind },
        ...(source ? { source } : {}),
      });
    }
    return;
  }

  logger.error(error, {
    data: { context: `React Query Error [${kind}]` },
  });
}

export const createQueryClient = (): QueryClient => {
  const queryCache = new QueryCache({
    onError: (error, query) =>
      reportQueryCacheError(error, "Query", query.queryHash),
  });

  const mutationCache = new MutationCache({
    onError: (error, _variables, _context, mutation) =>
      reportQueryCacheError(
        error,
        "Mutation",
        mutation.options.mutationKey?.join("."),
      ),
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
