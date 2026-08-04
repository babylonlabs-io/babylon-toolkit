import { beforeEach, describe, expect, it, vi } from "vitest";

const mockLoggerError = vi.hoisted(() => vi.fn());
const mockLoggerWarn = vi.hoisted(() => vi.fn());
vi.mock("@/infrastructure", () => ({
  logger: { error: mockLoggerError, warn: mockLoggerWarn },
}));

import {
  createQueryClient,
  isExpectedQueryError,
  reportQueryCacheError,
} from "../queryClient";

/**
 * A structural copy of the wallet-connector's error, constructed here so the
 * class identity differs from the real one — proving the match keys on
 * `error.name`, which survives bundling across the package boundary, rather
 * than `instanceof`.
 */
class OrdinalsClassifierUnavailableError extends Error {
  constructor() {
    super("Ordinals classifier unavailable: no ordinalsApiUrl configured");
    this.name = "OrdinalsClassifierUnavailableError";
  }
}

describe("isExpectedQueryError", () => {
  it("matches the ordinals classifier error by name, not by identity", () => {
    expect(isExpectedQueryError(new OrdinalsClassifierUnavailableError())).toBe(
      true,
    );

    const bareByName = new Error("whatever");
    bareByName.name = "OrdinalsClassifierUnavailableError";
    expect(isExpectedQueryError(bareByName)).toBe(true);
  });

  it("does not match an ordinary error", () => {
    expect(isExpectedQueryError(new Error("RPC 500"))).toBe(false);
  });
});

/**
 * The retry predicate is exercised through the wired client rather than
 * exported directly, so these tests pin the behaviour production actually gets.
 */
describe("default query retry policy", () => {
  const retryFor = (error: Error, failureCount = 0): boolean => {
    const retry = createQueryClient().getDefaultOptions().queries?.retry;
    if (typeof retry !== "function") {
      throw new Error(
        "expected a retry predicate on the default query options",
      );
    }
    return retry(failureCount, error) as boolean;
  };

  /** graphql-request's ClientError shape. */
  const httpError = (status: number): Error =>
    Object.assign(new Error(`GraphQL Error (Code: ${status})`), {
      response: { status },
    });

  it("does not retry a 451, which is permanent for the session", () => {
    // A geo-block previously retried on every poll cycle, forever, and each
    // settled failure billed a separate Sentry issue.
    expect(retryFor(httpError(451))).toBe(false);
  });

  it("does not retry other permanent statuses", () => {
    expect(retryFor(httpError(403))).toBe(false);
    expect(retryFor(httpError(404))).toBe(false);
  });

  it("does not retry a 501, despite it being 5xx", () => {
    // 501 means the server does not implement the operation, which retrying
    // cannot change. Pinned because the neighbouring 5xx rule says the
    // opposite and the two are easy to conflate.
    expect(retryFor(httpError(501))).toBe(false);
  });

  it("still retries a rate limit and a server error", () => {
    expect(retryFor(httpError(429))).toBe(true);
    expect(retryFor(httpError(503))).toBe(true);
  });

  it("still retries a transient network failure", () => {
    expect(retryFor(new Error("Failed to fetch"))).toBe(true);
  });

  it("does not retry a user-cancelled wallet prompt", () => {
    expect(retryFor(new Error("User rejected the request."))).toBe(false);
  });

  it("gives up after three failures", () => {
    expect(retryFor(new Error("Failed to fetch"), 3)).toBe(false);
  });
});

describe("reportQueryCacheError", () => {
  beforeEach(() => {
    mockLoggerError.mockReset();
    mockLoggerWarn.mockReset();
  });

  it("records an expected query error as a breadcrumb, not a captured error", () => {
    reportQueryCacheError(new OrdinalsClassifierUnavailableError(), "Query");

    expect(mockLoggerError).not.toHaveBeenCalled();
    expect(mockLoggerWarn).toHaveBeenCalledTimes(1);
    const [message] = mockLoggerWarn.mock.calls[0];
    expect(message).toContain("OrdinalsClassifierUnavailableError");
  });

  it("records a permanent HTTP failure as a breadcrumb, not a captured error", () => {
    reportQueryCacheError(
      Object.assign(new Error("GraphQL Error (Code: 451)"), {
        response: { status: 451 },
      }),
      "Query",
    );

    expect(mockLoggerError).not.toHaveBeenCalled();
    expect(mockLoggerWarn).toHaveBeenCalledTimes(1);
    expect(mockLoggerWarn.mock.calls[0][0]).toContain("451");
  });

  it("still captures a 400, which is a defect rather than a location", () => {
    // Not retrying and not reporting are separate decisions. A malformed query
    // is pointless to retry but someone needs to see it.
    reportQueryCacheError(
      Object.assign(new Error("GraphQL Error (Code: 400)"), {
        response: { status: 400 },
      }),
      "Query",
    );

    expect(mockLoggerWarn).not.toHaveBeenCalled();
    expect(mockLoggerError).toHaveBeenCalledTimes(1);
  });

  it("still captures a 501, which signals a frontend/backend skew", () => {
    reportQueryCacheError(
      Object.assign(new Error("GraphQL Error (Code: 501)"), {
        response: { status: 501 },
      }),
      "Query",
    );

    expect(mockLoggerWarn).not.toHaveBeenCalled();
    expect(mockLoggerError).toHaveBeenCalledTimes(1);
  });

  it("captures a viem-shaped error carrying a top-level status", () => {
    // viem's HttpRequestError puts the status on the error itself rather than
    // under `response`, and it does reach this handler.
    reportQueryCacheError(
      Object.assign(new Error("HTTP request failed"), { status: 401 }),
      "Query",
    );

    expect(mockLoggerWarn).not.toHaveBeenCalled();
    expect(mockLoggerError).toHaveBeenCalledTimes(1);
  });

  it("captures a genuine query error with the query context tag", () => {
    reportQueryCacheError(new Error("RPC timeout"), "Query");

    expect(mockLoggerWarn).not.toHaveBeenCalled();
    expect(mockLoggerError).toHaveBeenCalledTimes(1);
    const [err, ctx] = mockLoggerError.mock.calls[0];
    expect(err).toBeInstanceOf(Error);
    expect(ctx.data.context).toBe("React Query Error [Query]");
  });

  it("captures a genuine mutation error with the mutation context tag", () => {
    reportQueryCacheError(new Error("write failed"), "Mutation");

    expect(mockLoggerError).toHaveBeenCalledTimes(1);
    expect(mockLoggerError.mock.calls[0][1].data.context).toBe(
      "React Query Error [Mutation]",
    );
  });
});
