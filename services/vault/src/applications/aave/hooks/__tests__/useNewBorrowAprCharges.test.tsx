import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SPOKE = "0x00000000000000000000000000000000000000bb";
const VBTC_RESERVE_ID = 7n;

const mocks = vi.hoisted(() => ({
  getReserve: vi.fn(),
}));

vi.mock("../../clients", () => ({
  AaveSpoke: { getReserve: mocks.getReserve },
}));

vi.mock("../../clients/transaction", () => ({
  getInterestFeeBps: vi.fn(),
}));

vi.mock("../../config", () => ({
  getAaveAdapterAddress: () => "0x00000000000000000000000000000000000000aa",
}));

// The indexed value disagrees with every on-chain value below, so a hook that
// read it would fail these tests.
vi.mock("../../context", () => ({
  useAaveConfig: () => ({
    config: {
      coreSpokeAddress: SPOKE,
      vaultBtcReserveId: VBTC_RESERVE_ID,
    },
    vbtcReserve: { reserve: { collateralRisk: 9999 } },
  }),
}));

import { getInterestFeeBps } from "../../clients/transaction";
import { useNewBorrowAprCharges } from "../useNewBorrowAprCharges";

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

describe("useNewBorrowAprCharges", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getInterestFeeBps).mockResolvedValue(300);
  });

  it("takes the premium from vBTC's on-chain collateral risk, not the indexed one", async () => {
    mocks.getReserve.mockResolvedValueOnce({ collateralRisk: 1000 });

    const { result } = renderHook(() => useNewBorrowAprCharges(), {
      wrapper: wrapperFor(makeClient()),
    });

    await waitFor(() =>
      expect(result.current).toEqual({
        premiumFraction: 0.1,
        interestFeeBps: 300,
      }),
    );
    expect(mocks.getReserve).toHaveBeenCalledWith(SPOKE, VBTC_RESERVE_ID);
  });

  it("treats zero collateral risk as a zero premium, not a missing one", async () => {
    mocks.getReserve.mockResolvedValueOnce({ collateralRisk: 0 });

    const { result } = renderHook(() => useNewBorrowAprCharges(), {
      wrapper: wrapperFor(makeClient()),
    });

    await waitFor(() => expect(result.current.premiumFraction).toBe(0));
  });

  it("leaves the premium null when the reserve read fails, keeping the fee", async () => {
    mocks.getReserve.mockRejectedValueOnce(new Error("RPC failure"));

    const { result } = renderHook(() => useNewBorrowAprCharges(), {
      wrapper: wrapperFor(makeClient()),
    });

    await waitFor(() => expect(result.current.interestFeeBps).toBe(300));
    await waitFor(() => expect(mocks.getReserve).toHaveBeenCalled());
    expect(result.current.premiumFraction).toBeNull();
  });

  it("clears the premium after a refetch fails", async () => {
    const client = makeClient();
    mocks.getReserve
      .mockResolvedValueOnce({ collateralRisk: 1000 })
      .mockRejectedValueOnce(new Error("RPC failure"));

    const { result } = renderHook(() => useNewBorrowAprCharges(), {
      wrapper: wrapperFor(client),
    });
    await waitFor(() => expect(result.current.premiumFraction).toBe(0.1));

    await client.refetchQueries({
      queryKey: ["aaveNewBorrowPremiumFraction"],
    });

    await waitFor(() => expect(result.current.premiumFraction).toBeNull());
  });
});
