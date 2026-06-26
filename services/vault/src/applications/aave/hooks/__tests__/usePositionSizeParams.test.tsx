import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Address } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config", () => ({
  getAaveAdapterAddress: () =>
    "0x0000000000000000000000000000000000000010" as Address,
}));
vi.mock("../../clients", () => ({
  AaveAdapter: { getPositionSizeParams: vi.fn() },
}));

import { AaveAdapter } from "../../clients";
import { usePositionSizeParams } from "../usePositionSizeParams";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("usePositionSizeParams", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the on-chain vault cap as a number", async () => {
    vi.mocked(AaveAdapter.getPositionSizeParams).mockResolvedValueOnce({
      maxPositionBTC: 100_000_000n,
      maxVaultsPerPosition: 10n,
    });
    const { result } = renderHook(() => usePositionSizeParams(), { wrapper });
    await waitFor(() => expect(result.current.maxVaultsPerPosition).toBe(10));
  });

  it("treats a non-positive contract cap as unknown (null)", async () => {
    vi.mocked(AaveAdapter.getPositionSizeParams).mockResolvedValueOnce({
      maxPositionBTC: 0n,
      maxVaultsPerPosition: 0n,
    });
    const { result } = renderHook(() => usePositionSizeParams(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.maxVaultsPerPosition).toBeNull();
  });
});
