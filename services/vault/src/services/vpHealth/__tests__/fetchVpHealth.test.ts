import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/config/env", () => ({
  ENV: { VP_PROXY_URL: "https://proxy.example.com" },
}));

vi.mock("@/infrastructure", () => ({
  logger: { warn: vi.fn() },
}));

import { fetchVpHealth } from "../fetchVpHealth";

describe("fetchVpHealth", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns snapshots on 200", async () => {
    const snapshots = [
      {
        address: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
        totalRequests: 10,
        successCount: 8,
        errorCount: 2,
        successRate: 0.8,
        error5xxCount: 2,
        avgResponseMs: 100,
        p95ResponseMs: 200,
      },
    ];

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(snapshots), { status: 200 }),
    );

    const result = await fetchVpHealth();
    expect(result).toEqual(snapshots);
    expect(fetch).toHaveBeenCalledWith("https://proxy.example.com/vp-health");
  });

  it("returns empty array on 500", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("", { status: 500 }));

    const result = await fetchVpHealth();
    expect(result).toEqual([]);
  });

  it("returns empty array on 503", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("", { status: 503 }));

    const result = await fetchVpHealth();
    expect(result).toEqual([]);
  });

  it("returns empty array on network error", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("fetch failed"));

    const result = await fetchVpHealth();
    expect(result).toEqual([]);
  });
});
