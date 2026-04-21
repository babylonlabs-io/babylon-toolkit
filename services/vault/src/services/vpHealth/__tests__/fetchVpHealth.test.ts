import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/config/env", () => ({
  ENV: { VP_PROXY_URL: "https://proxy.example.com" },
}));

vi.mock("@/infrastructure", () => ({
  logger: { warn: vi.fn() },
}));

import { fetchVpHealth } from "../fetchVpHealth";

const VALID_ADDRESS = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa";

function makeSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    address: VALID_ADDRESS,
    totalRequests: 10,
    successCount: 8,
    errorCount: 2,
    successRate: 0.8,
    error5xxCount: 2,
    avgResponseMs: 100,
    p95ResponseMs: 200,
    ...overrides,
  };
}

function mockFetchResponse(body: unknown, status = 200) {
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status }),
  );
}

describe("fetchVpHealth", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("returns snapshots on 200 with valid data", async () => {
    const snapshots = [makeSnapshot()];
    mockFetchResponse(snapshots);

    const result = await fetchVpHealth();
    expect(result).toEqual(snapshots);
    expect(fetch).toHaveBeenCalledWith(
      "https://proxy.example.com/vp-health",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("returns empty array on 500", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("", { status: 500 }));

    const result = await fetchVpHealth();
    expect(result).toEqual([]);
  });

  it("returns empty array on network error", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("fetch failed"));

    const result = await fetchVpHealth();
    expect(result).toEqual([]);
  });

  describe("timeout", () => {
    it("aborts fetch after 15 seconds", async () => {
      vi.mocked(fetch).mockImplementationOnce(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            (init as RequestInit).signal?.addEventListener("abort", () => {
              reject(
                new DOMException("The operation was aborted", "AbortError"),
              );
            });
          }),
      );

      const promise = fetchVpHealth();
      vi.advanceTimersByTime(15_000);

      const result = await promise;
      expect(result).toEqual([]);
    });
  });

  describe("validation", () => {
    it("drops entries with invalid Ethereum address", async () => {
      mockFetchResponse([
        makeSnapshot({ address: "not-an-address" }),
        makeSnapshot({ address: VALID_ADDRESS }),
      ]);

      const result = await fetchVpHealth();
      expect(result).toHaveLength(1);
      expect(result[0].address).toBe(VALID_ADDRESS);
    });

    it("drops entries with successRate below 0", async () => {
      mockFetchResponse([makeSnapshot({ successRate: -1 })]);

      const result = await fetchVpHealth();
      expect(result).toEqual([]);
    });

    it("drops entries with successRate above 1", async () => {
      mockFetchResponse([makeSnapshot({ successRate: 2 })]);

      const result = await fetchVpHealth();
      expect(result).toEqual([]);
    });

    it("drops entries with negative totalRequests", async () => {
      mockFetchResponse([makeSnapshot({ totalRequests: -5 })]);

      const result = await fetchVpHealth();
      expect(result).toEqual([]);
    });

    it("accepts successRate at boundary values 0 and 1", async () => {
      mockFetchResponse([
        makeSnapshot({ successRate: 0 }),
        makeSnapshot({ successRate: 1 }),
      ]);

      const result = await fetchVpHealth();
      expect(result).toHaveLength(2);
    });

    it("drops entries with non-string address", async () => {
      mockFetchResponse([makeSnapshot({ address: 123 })]);

      const result = await fetchVpHealth();
      expect(result).toEqual([]);
    });

    it("drops entries with non-number successRate", async () => {
      mockFetchResponse([makeSnapshot({ successRate: "high" })]);

      const result = await fetchVpHealth();
      expect(result).toEqual([]);
    });

    it("returns empty array for non-array response", async () => {
      mockFetchResponse({ not: "an array" });

      const result = await fetchVpHealth();
      expect(result).toEqual([]);
    });
  });
});
