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

vi.mock("../../../config/env", () => ({
  ENV: { GRAPHQL_ENDPOINT: "https://graphql.test/v1/graphql" },
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

describe("graphqlClient timeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("clears timeout after successful response", async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");

    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ data: { vaults: [] } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { graphqlClient } = await import("../client");
    await graphqlClient.request("{ vaults { id } }");

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it("rethrows caller-initiated abort without wrapping as timeout", async () => {
    vi.useRealTimers();
    const callerController = new AbortController();
    const abortError = new DOMException(
      "The operation was aborted.",
      "AbortError",
    );

    mockFetch.mockImplementation(
      (_url: string, options?: RequestInit) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => {
            reject(abortError);
          });
        }),
    );

    const { graphqlClient } = await import("../client");
    const customFetch = graphqlClient.requestConfig.fetch!;

    const promise = customFetch("https://graphql.test/v1/graphql", {
      signal: callerController.signal,
    });
    callerController.abort();

    await expect(promise).rejects.toThrow("The operation was aborted.");
    vi.useFakeTimers();
  });

  it("aborts requests after 30s timeout", async () => {
    mockFetch.mockImplementation(
      (_url: string, options?: RequestInit) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => {
            reject(
              new DOMException("The operation was aborted.", "AbortError"),
            );
          });
        }),
    );

    // Dynamic import to pick up mocked env and fetch
    const { graphqlClient } = await import("../client");

    const promise = graphqlClient.request("{ vaults { id } }");
    // Attach rejection handler before advancing timers to avoid unhandled rejection
    const assertion = expect(promise).rejects.toThrow(
      /timed out after 30000ms/,
    );
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
  });
});
