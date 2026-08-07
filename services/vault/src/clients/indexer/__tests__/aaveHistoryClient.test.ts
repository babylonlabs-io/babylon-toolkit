import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: { GRAPHQL_ENDPOINT: "https://indexer.test" },
}));
vi.mock("../../../config/env", () => ({
  ENV: mockEnv,
}));

const mockFetch = vi.fn();

beforeAll(() => {
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  mockFetch.mockReset();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("indexerRestBaseUrl", () => {
  it("returns the endpoint unchanged when it is a bare origin", async () => {
    mockEnv.GRAPHQL_ENDPOINT = "https://indexer.test";
    const { indexerRestBaseUrl } = await import("../aaveHistoryClient");
    expect(indexerRestBaseUrl()).toBe("https://indexer.test");
  });

  it("strips a trailing /graphql suffix", async () => {
    mockEnv.GRAPHQL_ENDPOINT = "https://indexer.test/graphql";
    const { indexerRestBaseUrl } = await import("../aaveHistoryClient");
    expect(indexerRestBaseUrl()).toBe("https://indexer.test");
  });

  it("preserves a path prefix while stripping the /graphql suffix", async () => {
    mockEnv.GRAPHQL_ENDPOINT = "https://host/prefix/graphql";
    const { indexerRestBaseUrl } = await import("../aaveHistoryClient");
    expect(indexerRestBaseUrl()).toBe("https://host/prefix");
  });
});

describe("fetchBorrowRateHistory", () => {
  beforeEach(() => {
    mockEnv.GRAPHQL_ENDPOINT = "https://indexer.test";
  });

  it("builds the request URL from a bare-origin endpoint", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ points: [] }));
    const { fetchBorrowRateHistory } = await import("../aaveHistoryClient");

    await fetchBorrowRateHistory({ reserveId: 7n, range: "1w" });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://indexer.test/api/aave/reserves/7/history?range=1w&resolution=auto",
      expect.anything(),
    );
  });

  it("builds the request URL from a …/graphql-suffixed endpoint", async () => {
    mockEnv.GRAPHQL_ENDPOINT = "https://host/prefix/graphql";
    mockFetch.mockResolvedValueOnce(jsonResponse({ points: [] }));
    const { fetchBorrowRateHistory } = await import("../aaveHistoryClient");

    await fetchBorrowRateHistory({ reserveId: 42n, range: "1d" });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://host/prefix/api/aave/reserves/42/history?range=1d&resolution=auto",
      expect.anything(),
    );
  });

  it("maps seconds to milliseconds and passes through the rate percent", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        points: [
          { t: 1_700_000_000, borrowRatePercent: 3.25 },
          { t: 1_700_003_600, borrowRatePercent: 3.5 },
        ],
      }),
    );
    const { fetchBorrowRateHistory } = await import("../aaveHistoryClient");

    const points = await fetchBorrowRateHistory({ reserveId: 1n, range: "1m" });

    expect(points).toEqual([
      { timeMs: 1_700_000_000_000, ratePercent: 3.25 },
      { timeMs: 1_700_003_600_000, ratePercent: 3.5 },
    ]);
  });

  it("returns an empty array for a valid empty-points response", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ points: [] }));
    const { fetchBorrowRateHistory } = await import("../aaveHistoryClient");

    const points = await fetchBorrowRateHistory({
      reserveId: 1n,
      range: "all",
    });

    expect(points).toEqual([]);
  });

  it("throws a named error on a non-OK response", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 500));
    const { fetchBorrowRateHistory } = await import("../aaveHistoryClient");

    await expect(
      fetchBorrowRateHistory({ reserveId: 1n, range: "1w" }),
    ).rejects.toThrow(/aave\/reserves\/1\/history.*failed with status 500/);
  });

  it("throws a parse error — not a network-failure message — on a malformed JSON body", async () => {
    mockFetch.mockResolvedValueOnce(new Response("not-json{", { status: 200 }));
    const { fetchBorrowRateHistory } = await import("../aaveHistoryClient");

    await expect(
      fetchBorrowRateHistory({ reserveId: 1n, range: "1w" }),
    ).rejects.toThrow(/is not valid JSON/);
  });

  it("throws when the payload has no points array", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ reserveId: "1" }));
    const { fetchBorrowRateHistory } = await import("../aaveHistoryClient");

    await expect(
      fetchBorrowRateHistory({ reserveId: 1n, range: "1w" }),
    ).rejects.toThrow(/points/);
  });

  it("throws when a point's borrowRatePercent is not a finite number", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        points: [{ t: 1_700_000_000, borrowRatePercent: "3.25" }],
      }),
    );
    const { fetchBorrowRateHistory } = await import("../aaveHistoryClient");

    await expect(
      fetchBorrowRateHistory({ reserveId: 1n, range: "1w" }),
    ).rejects.toThrow(/borrowRatePercent/);
  });

  it("throws when a point's t is not a finite number", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        points: [{ t: Number.NaN, borrowRatePercent: 3.25 }],
      }),
    );
    const { fetchBorrowRateHistory } = await import("../aaveHistoryClient");

    await expect(
      fetchBorrowRateHistory({ reserveId: 1n, range: "1w" }),
    ).rejects.toThrow(/"t"/);
  });

  it("throws a named error when fetch itself rejects", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));
    const { fetchBorrowRateHistory } = await import("../aaveHistoryClient");

    await expect(
      fetchBorrowRateHistory({ reserveId: 1n, range: "1w" }),
    ).rejects.toThrow(/indexer\.test/);
  });
});
