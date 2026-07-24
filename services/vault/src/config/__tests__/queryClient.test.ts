import { beforeEach, describe, expect, it, vi } from "vitest";

const mockLoggerError = vi.hoisted(() => vi.fn());
const mockLoggerWarn = vi.hoisted(() => vi.fn());
vi.mock("@/infrastructure", () => ({
  logger: { error: mockLoggerError, warn: mockLoggerWarn },
}));

import { isExpectedQueryError, reportQueryCacheError } from "../queryClient";

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
