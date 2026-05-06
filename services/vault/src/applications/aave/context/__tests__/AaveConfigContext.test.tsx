import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchAaveAppConfig } from "../../services";
import { AaveConfigProvider, useAaveConfig } from "../AaveConfigContext";

vi.mock("../../services", () => ({
  fetchAaveAppConfig: vi.fn(),
}));

vi.mock("@babylonlabs-io/core-ui", () => ({
  Loader: () => <div data-testid="loader" />,
  Button: ({
    children,
    onClick,
  }: {
    children: ReactNode;
    onClick?: () => void;
  }) => (
    <button data-testid="retry" onClick={onClick}>
      {children}
    </button>
  ),
}));

const mockFetch = vi.mocked(fetchAaveAppConfig);

function ConsumerProbe() {
  const ctx = useAaveConfig();
  return (
    <div data-testid="probe">
      {ctx.config ? "config-present" : "config-null"}
    </div>
  );
}

function wrapper(): {
  Wrapper: ({ children }: { children: ReactNode }) => JSX.Element;
  client: QueryClient;
} {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    client,
    Wrapper: ({ children }) => (
      <QueryClientProvider client={client}>
        <AaveConfigProvider>{children}</AaveConfigProvider>
      </QueryClientProvider>
    ),
  };
}

describe("AaveConfigProvider — fail-closed on fetch failure (audit #312)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the unavailable state when the GraphQL fetch throws", async () => {
    mockFetch.mockRejectedValueOnce(new Error("indexer down"));
    const { Wrapper } = wrapper();

    render(
      <Wrapper>
        <ConsumerProbe />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.queryByTestId("loader")).not.toBeInTheDocument();
    });

    expect(screen.queryByTestId("probe")).not.toBeInTheDocument();
    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
    expect(screen.getByTestId("retry")).toBeInTheDocument();
  });

  it("renders the unavailable state when fetchAaveAppConfig returns null", async () => {
    mockFetch.mockResolvedValueOnce(null);
    const { Wrapper } = wrapper();

    render(
      <Wrapper>
        <ConsumerProbe />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.queryByTestId("loader")).not.toBeInTheDocument();
    });

    expect(screen.queryByTestId("probe")).not.toBeInTheDocument();
    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
  });

  it("retries the fetch when the user clicks Retry", async () => {
    mockFetch.mockRejectedValueOnce(new Error("indexer down"));
    const { Wrapper } = wrapper();

    render(
      <Wrapper>
        <ConsumerProbe />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("retry")).toBeInTheDocument();
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("retry"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  it("respects errorFallback override (null suppresses the default panel)", async () => {
    mockFetch.mockRejectedValueOnce(new Error("indexer down"));
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <AaveConfigProvider errorFallback={null}>
          <ConsumerProbe />
        </AaveConfigProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByTestId("loader")).not.toBeInTheDocument();
    });

    expect(screen.queryByTestId("probe")).not.toBeInTheDocument();
    expect(screen.queryByTestId("retry")).not.toBeInTheDocument();
    expect(screen.queryByText(/Something went wrong/i)).not.toBeInTheDocument();
  });

  it("renders children when fetch succeeds", async () => {
    mockFetch.mockResolvedValueOnce({
      config: {
        adapterAddress: "0x1",
        vaultBtcAddress: "0x2",
        btcVaultRegistryAddress: "0x3",
        coreSpokeAddress: "0x4" as `0x${string}`,
        btcVaultCoreVbtcReserveId: 1n,
      },
      vbtcReserve: null,
      borrowableReserves: [],
      allBorrowReserves: [],
    });
    const { Wrapper } = wrapper();

    render(
      <Wrapper>
        <ConsumerProbe />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("probe")).toHaveTextContent("config-present");
    });
  });
});
