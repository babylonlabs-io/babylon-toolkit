import { useQuery } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useVaults } from "../useVaults";

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
}));

vi.mock("../../services/vault/fetchVaults", () => ({
  fetchVaultsByDepositor: vi.fn(),
}));

const mockedUseQuery = vi.mocked(useQuery);

const ADDRESS = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" as const;

function getRefetchInterval(): unknown {
  const args = mockedUseQuery.mock.calls.at(-1)?.[0];
  if (!args || typeof args !== "object") return undefined;
  return (args as { refetchInterval?: unknown }).refetchInterval;
}

describe("useVaults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseQuery.mockReturnValue({ data: undefined } as never);
  });

  it("disables polling when poll is false (default)", () => {
    renderHook(() => useVaults(ADDRESS));
    expect(getRefetchInterval()).toBe(false);
  });

  it("disables polling even when interval is supplied if poll is false", () => {
    renderHook(() => useVaults(ADDRESS, { interval: 30_000 }));
    expect(getRefetchInterval()).toBe(false);
  });

  it("uses the default 5s interval when poll is true with no explicit interval", () => {
    renderHook(() => useVaults(ADDRESS, { poll: true }));
    expect(getRefetchInterval()).toBe(5_000);
  });

  it("uses the explicit interval when poll is true", () => {
    renderHook(() => useVaults(ADDRESS, { poll: true, interval: 60_000 }));
    expect(getRefetchInterval()).toBe(60_000);
  });

  it("propagates a new interval to React Query when the prop changes", () => {
    const { rerender } = renderHook(
      ({ interval }: { interval: number }) =>
        useVaults(ADDRESS, { poll: true, interval }),
      { initialProps: { interval: 15_000 } },
    );
    expect(getRefetchInterval()).toBe(15_000);

    rerender({ interval: 60_000 });
    expect(getRefetchInterval()).toBe(60_000);
  });
});
