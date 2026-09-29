import { useQuery } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProtocolParamsProvider } from "../ProtocolParamsContext";

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
}));

vi.mock("@/clients/eth-contract/sdk-readers", () => ({
  getProtocolParamsReader: vi.fn(),
}));

vi.mock("@/hooks/useOffchainParams", () => ({
  offchainParamsQueryOptions: () => ({ queryKey: ["offchain-params"] }),
}));

vi.mock("@/services/providers", () => ({
  fetchAllUniversalChallengers: vi.fn(),
}));

const mockUseQuery = vi.mocked(useQuery);
const CONFIG = {
  minimumPegInAmount: 1n,
  maxPegInAmount: 2n,
  timelockPegin: 3,
  timelockRefund: 4,
  minVpCommissionBps: 5,
};

function mockProtocolQueries(challengerError: Error) {
  mockUseQuery
    .mockReturnValueOnce({
      data: CONFIG,
      isLoading: false,
      error: null,
    } as never)
    .mockReturnValueOnce({
      data: undefined,
      isLoading: false,
      error: challengerError,
    } as never)
    .mockReturnValueOnce({
      data: { byVersion: new Map() },
      isLoading: false,
      error: null,
    } as never);
}

describe("ProtocolParamsProvider challenger readiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps recovery children available when the challenger roster fails", () => {
    mockProtocolQueries(new Error("challenger roster unavailable"));

    render(
      <ProtocolParamsProvider>
        <div>recovery action</div>
      </ProtocolParamsProvider>,
    );

    expect(screen.getByText("recovery action")).toBeInTheDocument();
    expect(mockUseQuery.mock.calls[1][0]).toMatchObject({ enabled: false });
  });

  it("blocks fresh deposits when the challenger roster fails", () => {
    mockProtocolQueries(new Error("challenger roster unavailable"));

    render(
      <ProtocolParamsProvider requireUniversalChallengers>
        <div>fresh deposit</div>
      </ProtocolParamsProvider>,
    );

    expect(screen.queryByText("fresh deposit")).not.toBeInTheDocument();
    expect(
      screen.getByText("challenger roster unavailable"),
    ).toBeInTheDocument();
    expect(mockUseQuery.mock.calls[1][0]).toMatchObject({
      enabled: true,
      refetchOnReconnect: false,
    });
    // A remount must be able to retry a transient failure.
    expect(mockUseQuery.mock.calls[1][0].retryOnMount).not.toBe(false);
  });
});
