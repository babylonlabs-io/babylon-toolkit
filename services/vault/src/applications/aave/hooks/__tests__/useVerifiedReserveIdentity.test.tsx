import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Address } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ADAPTER = "0x000000000000000000000000000000000000ada9" as Address;
const TOKEN_USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address;
const RESERVE_ID = 7n;

vi.mock("../../config", () => ({
  getAaveAdapterAddress: () => ADAPTER,
}));

vi.mock("../../services/verifyReserveIdentity", async () => {
  const actual = await vi.importActual<
    typeof import("../../services/verifyReserveIdentity")
  >("../../services/verifyReserveIdentity");
  return { ...actual, verifyReserveIdentity: vi.fn() };
});

import {
  UnknownReserveTokenError,
  verifyReserveIdentity,
} from "../../services/verifyReserveIdentity";
import { useVerifiedReserveIdentity } from "../useVerifiedReserveIdentity";

const mockVerifyReserveIdentity = vi.mocked(verifyReserveIdentity);

const IDENTITY = {
  address: TOKEN_USDC,
  symbol: "USDC",
  name: "USD Coin",
  decimals: 6,
  icon: undefined,
  source: "registry" as const,
};

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retryDelay: 0 } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function render() {
  return renderHook(
    () =>
      useVerifiedReserveIdentity({
        reserveId: RESERVE_ID,
        underlying: TOKEN_USDC,
      }),
    { wrapper },
  );
}

describe("useVerifiedReserveIdentity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the verified identity once the on-chain proof resolves", async () => {
    mockVerifyReserveIdentity.mockResolvedValue(IDENTITY);

    const { result } = render();

    await waitFor(() => expect(result.current.identity).toEqual(IDENTITY));
    expect(result.current.error).toBeNull();
    expect(mockVerifyReserveIdentity).toHaveBeenCalledWith(
      ADAPTER,
      RESERVE_ID,
      TOKEN_USDC,
    );
  });

  it("stays disabled until both the reserve id and the underlying are known", () => {
    const { result } = renderHook(
      () =>
        useVerifiedReserveIdentity({
          reserveId: undefined,
          underlying: TOKEN_USDC,
        }),
      { wrapper },
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.identity).toBeNull();
    expect(mockVerifyReserveIdentity).not.toHaveBeenCalled();
  });

  it("does not retry a proven integrity failure", async () => {
    mockVerifyReserveIdentity.mockRejectedValue(
      new UnknownReserveTokenError("no trusted label"),
    );

    const { result } = render();

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(mockVerifyReserveIdentity).toHaveBeenCalledTimes(1);
    expect(result.current.isIntegrityViolation).toBe(true);
  });

  it("retries a transient RPC failure twice before giving up", async () => {
    mockVerifyReserveIdentity.mockRejectedValue(
      new Error("rpc connection lost"),
    );

    const { result } = render();

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(mockVerifyReserveIdentity).toHaveBeenCalledTimes(3);
    expect(result.current.isIntegrityViolation).toBe(false);
  });

  it("withholds the identity whenever an error is present", async () => {
    mockVerifyReserveIdentity.mockRejectedValue(
      new UnknownReserveTokenError("no trusted label"),
    );

    const { result } = render();

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.identity).toBeNull();
  });
});
