import { useQuery } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { VpHealthSnapshot } from "../../types/vpHealth";
import { useDisabledVps } from "../useDisabledVps";

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

describe("useDisabledVps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty set when query has no data", () => {
    mockedUseQuery.mockReturnValue({ data: undefined } as never);

    const { result } = renderHook(() => useDisabledVps());
    expect(result.current.size).toBe(0);
  });

  it("returns empty set when no VP is disabled", () => {
    mockedUseQuery.mockReturnValue({
      data: [
        makeSnapshot("0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"),
        makeSnapshot("0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB", {
          disabled: false,
        }),
      ],
    } as never);

    const { result } = renderHook(() => useDisabledVps());
    expect(result.current.size).toBe(0);
  });

  it("collects addresses of disabled VPs, lowercased", () => {
    mockedUseQuery.mockReturnValue({
      data: [
        makeSnapshot("0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", {
          disabled: true,
        }),
        makeSnapshot("0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB", {
          disabled: false,
        }),
      ],
    } as never);

    const { result } = renderHook(() => useDisabledVps());
    expect(result.current.size).toBe(1);
    expect(
      result.current.has(
        "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA".toLowerCase(),
      ),
    ).toBe(true);
  });

  it("treats a disabled VP independently of its success rate", () => {
    mockedUseQuery.mockReturnValue({
      data: [
        makeSnapshot("0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", {
          disabled: true,
          successRate: 1,
          totalRequests: 0,
        }),
      ],
    } as never);

    const { result } = renderHook(() => useDisabledVps());
    expect(
      result.current.has(
        "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA".toLowerCase(),
      ),
    ).toBe(true);
  });

  it("returns empty set on fetch error (graceful degradation)", () => {
    // When the fetch fails React Query exposes no data.
    mockedUseQuery.mockReturnValue({ data: undefined } as never);

    const { result } = renderHook(() => useDisabledVps());
    expect(result.current.size).toBe(0);
  });
});
