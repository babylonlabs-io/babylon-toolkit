import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../clients/aaveOracle", () => ({
  getOracleAddress: vi.fn(),
  getReservesPrices: vi.fn(),
}));

import { getOracleAddress, getReservesPrices } from "../../clients/aaveOracle";
import { useAaveReservePrice } from "../useAaveReservePrice";

const SPOKE = "0x0000000000000000000000000000000000000001" as const;
const ORACLE = "0x0000000000000000000000000000000000000002" as const;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useAaveReservePrice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOracleAddress).mockResolvedValue(ORACLE);
  });

  it("returns USD price scaled from 1e8 base units", async () => {
    vi.mocked(getReservesPrices).mockResolvedValueOnce([8_000_000_000_000n]);
    const { result } = renderHook(
      () => useAaveReservePrice({ spokeAddress: SPOKE, reserveId: 1n }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.priceUsd).toBe(80_000));
    expect(result.current.error).toBeNull();
  });

  it("returns null priceUsd and surfaces the error on oracle revert", async () => {
    vi.mocked(getReservesPrices).mockRejectedValueOnce(
      new Error("execution reverted: InvalidSource(7)"),
    );
    const { result } = renderHook(
      () => useAaveReservePrice({ spokeAddress: SPOKE, reserveId: 7n }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.priceUsd).toBeNull();
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it("clears stale priceUsd after a refetch fails (no stale-price leak)", async () => {
    // First fetch succeeds, then a forced refetch fails. React Query keeps
    // the prior `data` populated alongside `error`; the hook must zero it
    // out so downstream consumers don't display a price next to an error.
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.mocked(getReservesPrices)
      .mockResolvedValueOnce([8_000_000_000_000n])
      .mockRejectedValueOnce(new Error("RPC failure"));

    const wrapperWithClient = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(
      () => useAaveReservePrice({ spokeAddress: SPOKE, reserveId: 1n }),
      { wrapper: wrapperWithClient },
    );

    await waitFor(() => expect(result.current.priceUsd).toBe(80_000));

    await client.refetchQueries({ queryKey: ["aaveReservePrice"] });

    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect(result.current.priceUsd).toBeNull();
  });

  it("is disabled when reserveId is undefined", () => {
    const { result } = renderHook(
      () => useAaveReservePrice({ spokeAddress: SPOKE, reserveId: undefined }),
      { wrapper },
    );
    expect(result.current.priceUsd).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(getReservesPrices).not.toHaveBeenCalled();
  });

  it("is disabled when spokeAddress is undefined", () => {
    const { result } = renderHook(
      () => useAaveReservePrice({ spokeAddress: undefined, reserveId: 1n }),
      { wrapper },
    );
    expect(result.current.priceUsd).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(getOracleAddress).not.toHaveBeenCalled();
  });
});
