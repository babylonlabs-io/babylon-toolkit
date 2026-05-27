import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../clients/aaveOracle", () => ({
  getOracleAddress: vi.fn(),
  getReservesPricesSafe: vi.fn(),
}));

import {
  getOracleAddress,
  getReservesPricesSafe,
} from "../../clients/aaveOracle";
import { useAaveReservesPrices } from "../useAaveReservesPrices";

const SPOKE = "0x0000000000000000000000000000000000000001" as const;
const ORACLE = "0x0000000000000000000000000000000000000002" as const;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useAaveReservesPrices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOracleAddress).mockResolvedValue(ORACLE);
  });

  it("returns a record keyed by reserveId, leaving bad reserves null", async () => {
    vi.mocked(getReservesPricesSafe).mockResolvedValueOnce([
      { reserveId: 1n, priceRaw: 8_000_000_000_000n, error: null },
      { reserveId: 2n, priceRaw: null, error: new Error("reverted") },
      { reserveId: 3n, priceRaw: 100_000_000n, error: null },
    ]);
    const { result } = renderHook(
      () =>
        useAaveReservesPrices({
          spokeAddress: SPOKE,
          reserveIds: [1n, 2n, 3n],
        }),
      { wrapper },
    );
    await waitFor(() =>
      expect(result.current.pricesByReserveId).toEqual({
        "1": 80_000,
        "2": null,
        "3": 1,
      }),
    );
  });

  it("is disabled when reserveIds is empty", () => {
    const { result } = renderHook(
      () => useAaveReservesPrices({ spokeAddress: SPOKE, reserveIds: [] }),
      { wrapper },
    );
    expect(result.current.pricesByReserveId).toEqual({});
    expect(result.current.isLoading).toBe(false);
    expect(getReservesPricesSafe).not.toHaveBeenCalled();
  });

  it("clears stale pricesByReserveId after a refetch fails", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.mocked(getReservesPricesSafe)
      .mockResolvedValueOnce([
        { reserveId: 1n, priceRaw: 8_000_000_000_000n, error: null },
      ])
      .mockRejectedValueOnce(new Error("RPC failure"));

    const wrapperWithClient = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(
      () => useAaveReservesPrices({ spokeAddress: SPOKE, reserveIds: [1n] }),
      { wrapper: wrapperWithClient },
    );

    await waitFor(() =>
      expect(result.current.pricesByReserveId).toEqual({ "1": 80_000 }),
    );

    await client.refetchQueries({ queryKey: ["aaveReservesPrices"] });

    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect(result.current.pricesByReserveId).toEqual({});
  });
});
