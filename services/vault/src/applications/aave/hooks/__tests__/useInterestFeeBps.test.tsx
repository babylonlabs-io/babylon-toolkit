import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ADAPTER = "0x00000000000000000000000000000000000000aa";

vi.mock("../../clients/transaction", () => ({
  getInterestFeeBps: vi.fn(),
}));

vi.mock("../../config", () => ({
  getAaveAdapterAddress: () => ADAPTER,
}));

import { getInterestFeeBps } from "../../clients/transaction";
import { useInterestFeeBps } from "../useInterestFeeBps";

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

describe("useInterestFeeBps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the fee the adapter reports", async () => {
    vi.mocked(getInterestFeeBps).mockResolvedValueOnce(300);

    const { result } = renderHook(() => useInterestFeeBps({ enabled: true }), {
      wrapper: wrapperFor(makeClient()),
    });

    await waitFor(() => expect(result.current).toBe(300));
    expect(getInterestFeeBps).toHaveBeenCalledWith(ADAPTER);
  });

  it("returns a fee of zero as zero, not as missing", async () => {
    vi.mocked(getInterestFeeBps).mockResolvedValueOnce(0);

    const { result } = renderHook(() => useInterestFeeBps({ enabled: true }), {
      wrapper: wrapperFor(makeClient()),
    });

    await waitFor(() => expect(result.current).toBe(0));
  });

  it("is null and does not read the adapter while disabled", () => {
    const { result } = renderHook(() => useInterestFeeBps({ enabled: false }), {
      wrapper: wrapperFor(makeClient()),
    });

    expect(result.current).toBeNull();
    expect(getInterestFeeBps).not.toHaveBeenCalled();
  });

  it("clears the fee after a refetch fails", async () => {
    const client = makeClient();
    vi.mocked(getInterestFeeBps)
      .mockResolvedValueOnce(300)
      .mockRejectedValueOnce(new Error("RPC failure"));

    const { result } = renderHook(() => useInterestFeeBps({ enabled: true }), {
      wrapper: wrapperFor(client),
    });
    await waitFor(() => expect(result.current).toBe(300));

    await client.refetchQueries({ queryKey: ["aaveInterestFeeBps"] });

    await waitFor(() => expect(result.current).toBeNull());
  });
});
