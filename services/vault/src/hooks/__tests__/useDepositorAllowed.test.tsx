import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/clients/eth-contract/allow-list-policy", () => ({
  readDepositorAllowed: vi.fn(),
}));

import { readDepositorAllowed } from "@/clients/eth-contract/allow-list-policy";

import { useDepositorAllowed } from "../useDepositorAllowed";

const APP = "0x1111111111111111111111111111111111111111";
const DEPOSITOR = "0x2222222222222222222222222222222222222222";

function buildWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useDepositorAllowed", () => {
  it("asks the allow-list about the connected account in the deposit's application", async () => {
    vi.mocked(readDepositorAllowed).mockResolvedValue(true);

    const { result } = renderHook(() => useDepositorAllowed(APP, DEPOSITOR), {
      wrapper: buildWrapper().wrapper,
    });

    await waitFor(() => expect(result.current).toBe(true));
    expect(readDepositorAllowed).toHaveBeenCalledWith({
      applicationEntryPoint: APP,
      depositor: DEPOSITOR,
    });
  });

  it("returns false when the chain says the account is not on the allow-list", async () => {
    vi.mocked(readDepositorAllowed).mockResolvedValue(false);

    const { result } = renderHook(() => useDepositorAllowed(APP, DEPOSITOR), {
      wrapper: buildWrapper().wrapper,
    });

    await waitFor(() => expect(result.current).toBe(false));
  });

  it("returns null while the first read is in flight, so the deposit is not blocked", async () => {
    vi.mocked(readDepositorAllowed).mockImplementation(
      () => new Promise(() => {}),
    );

    const { result } = renderHook(() => useDepositorAllowed(APP, DEPOSITOR), {
      wrapper: buildWrapper().wrapper,
    });

    await waitFor(() => expect(readDepositorAllowed).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it("returns null once a read fails, even after an earlier read found the account unlisted", async () => {
    vi.mocked(readDepositorAllowed)
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(new Error("rpc unavailable"));
    const { client, wrapper } = buildWrapper();

    const { result } = renderHook(() => useDepositorAllowed(APP, DEPOSITOR), {
      wrapper,
    });
    await waitFor(() => expect(result.current).toBe(false));

    await act(() => client.refetchQueries());

    await waitFor(() => expect(result.current).toBeNull());
  });

  it("does not read the allow-list while no Ethereum account is connected", () => {
    const { result } = renderHook(() => useDepositorAllowed(APP, undefined), {
      wrapper: buildWrapper().wrapper,
    });

    expect(result.current).toBeNull();
    expect(readDepositorAllowed).not.toHaveBeenCalled();
  });

  it("does not read the allow-list before the deposit's application is known", () => {
    const { result } = renderHook(() => useDepositorAllowed("", DEPOSITOR), {
      wrapper: buildWrapper().wrapper,
    });

    expect(result.current).toBeNull();
    expect(readDepositorAllowed).not.toHaveBeenCalled();
  });
});
