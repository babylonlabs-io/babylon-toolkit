import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Address } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../clients/aaveOracle", () => ({
  getOracleAddress: vi.fn(),
}));

import { getOracleAddress } from "../../clients/aaveOracle";
import { useAaveOracleAddress } from "../useAaveOracleAddress";

const SPOKE_A = "0x0000000000000000000000000000000000000001" as Address;
const SPOKE_B = "0x0000000000000000000000000000000000000003" as Address;
const ORACLE_A = "0x0000000000000000000000000000000000000002" as Address;
const ORACLE_B = "0x0000000000000000000000000000000000000004" as Address;

function wrapperWith(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

function newClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

describe("useAaveOracleAddress", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the oracle address and caches across same-spoke rerenders", async () => {
    vi.mocked(getOracleAddress).mockResolvedValueOnce(ORACLE_A);
    const client = newClient();
    const { result, rerender } = renderHook(
      ({ spoke }: { spoke: Address }) =>
        useAaveOracleAddress({ spokeAddress: spoke }),
      { wrapper: wrapperWith(client), initialProps: { spoke: SPOKE_A } },
    );
    await waitFor(() => expect(result.current.oracleAddress).toBe(ORACLE_A));
    rerender({ spoke: SPOKE_A });
    expect(getOracleAddress).toHaveBeenCalledTimes(1);
  });

  it("re-fetches when spokeAddress changes", async () => {
    vi.mocked(getOracleAddress)
      .mockResolvedValueOnce(ORACLE_A)
      .mockResolvedValueOnce(ORACLE_B);
    const client = newClient();
    const { result, rerender } = renderHook(
      ({ spoke }: { spoke: Address }) =>
        useAaveOracleAddress({ spokeAddress: spoke }),
      { wrapper: wrapperWith(client), initialProps: { spoke: SPOKE_A } },
    );
    await waitFor(() => expect(result.current.oracleAddress).toBe(ORACLE_A));
    rerender({ spoke: SPOKE_B });
    await waitFor(() => expect(result.current.oracleAddress).toBe(ORACLE_B));
    expect(getOracleAddress).toHaveBeenCalledTimes(2);
  });

  it("is disabled when spokeAddress is undefined", () => {
    const { result } = renderHook(
      () => useAaveOracleAddress({ spokeAddress: undefined }),
      { wrapper: wrapperWith(newClient()) },
    );
    expect(result.current.oracleAddress).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(getOracleAddress).not.toHaveBeenCalled();
  });
});
