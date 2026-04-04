import { useQuery } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { VpHealthSnapshot } from "../../types/vpHealth";
import { useUnhealthyVps } from "../useUnhealthyVps";

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
}));

vi.mock("../../services/vpHealth", () => ({
  fetchVpHealth: vi.fn(),
}));

const mockedUseQuery = vi.mocked(useQuery);

function makeSnapshot(
  address: string,
  overrides: Partial<VpHealthSnapshot> = {},
): VpHealthSnapshot {
  return {
    address,
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

describe("useUnhealthyVps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty set when query has no data", () => {
    mockedUseQuery.mockReturnValue({ data: undefined } as never);

    const { result } = renderHook(() => useUnhealthyVps());
    expect(result.current.size).toBe(0);
  });

  it("returns empty set when all VPs are healthy", () => {
    mockedUseQuery.mockReturnValue({
      data: [
        makeSnapshot("0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", {
          successRate: 0.9,
          totalRequests: 10,
        }),
      ],
    } as never);

    const { result } = renderHook(() => useUnhealthyVps());
    expect(result.current.size).toBe(0);
  });

  it("marks VPs with low success rate as unhealthy", () => {
    mockedUseQuery.mockReturnValue({
      data: [
        makeSnapshot("0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", {
          successRate: 0.3,
          totalRequests: 10,
        }),
        makeSnapshot("0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB", {
          successRate: 0.9,
          totalRequests: 10,
        }),
      ],
    } as never);

    const { result } = renderHook(() => useUnhealthyVps());
    expect(result.current.size).toBe(1);
    expect(
      result.current.has(
        "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA".toLowerCase(),
      ),
    ).toBe(true);
  });

  it("does not flag VPs with too few requests", () => {
    mockedUseQuery.mockReturnValue({
      data: [
        makeSnapshot("0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", {
          successRate: 0.0,
          totalRequests: 2,
        }),
      ],
    } as never);

    const { result } = renderHook(() => useUnhealthyVps());
    expect(result.current.size).toBe(0);
  });

  it("returns empty set on fetch error (graceful degradation)", () => {
    // When React Query fails, data is undefined
    mockedUseQuery.mockReturnValue({ data: undefined } as never);

    const { result } = renderHook(() => useUnhealthyVps());
    expect(result.current.size).toBe(0);
  });

  it("configures polling with refetchInterval", () => {
    mockedUseQuery.mockReturnValue({ data: undefined } as never);

    renderHook(() => useUnhealthyVps());

    expect(mockedUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["vpHealth"],
        refetchInterval: 30_000,
        retry: false,
        refetchOnWindowFocus: false,
      }),
    );
  });
});
