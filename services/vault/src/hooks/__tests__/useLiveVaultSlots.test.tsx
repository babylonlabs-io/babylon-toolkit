import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { maxUint256 } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

const featureFlagsMock = vi.hoisted(() => ({ isVaultCapDisabled: false }));

vi.mock("@/config/featureFlags", () => ({ default: featureFlagsMock }));

vi.mock("@/clients/eth-contract/cap-policy", () => ({
  getAvailableLiveVaultSlots: vi.fn(),
}));

import { getAvailableLiveVaultSlots } from "@/clients/eth-contract/cap-policy";

import { useLiveVaultSlots } from "../useLiveVaultSlots";

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
  featureFlagsMock.isVaultCapDisabled = false;
});

describe("useLiveVaultSlots", () => {
  it("returns the free slots once the read resolves", async () => {
    vi.mocked(getAvailableLiveVaultSlots).mockResolvedValue(3n);

    const { result } = renderHook(() => useLiveVaultSlots(), {
      wrapper: buildWrapper().wrapper,
    });

    await waitFor(() => expect(result.current).toBe(3n));
  });

  it("returns null when the gate is off (CapPolicy reports max uint256 free slots)", async () => {
    vi.mocked(getAvailableLiveVaultSlots).mockResolvedValue(maxUint256);

    const { result } = renderHook(() => useLiveVaultSlots(), {
      wrapper: buildWrapper().wrapper,
    });

    await waitFor(() => expect(getAvailableLiveVaultSlots).toHaveBeenCalled());
    await act(async () => {});
    expect(result.current).toBeNull();
  });

  it("returns null while the first read is in flight, so the deposit is not blocked", async () => {
    vi.mocked(getAvailableLiveVaultSlots).mockImplementation(
      () => new Promise(() => {}),
    );

    const { result } = renderHook(() => useLiveVaultSlots(), {
      wrapper: buildWrapper().wrapper,
    });

    await waitFor(() => expect(getAvailableLiveVaultSlots).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it("returns null once a read fails, even after an earlier read found the protocol full", async () => {
    vi.mocked(getAvailableLiveVaultSlots)
      .mockResolvedValueOnce(0n)
      .mockRejectedValueOnce(new Error("execution reverted"));
    const { client, wrapper } = buildWrapper();

    const { result } = renderHook(() => useLiveVaultSlots(), { wrapper });
    await waitFor(() => expect(result.current).toBe(0n));

    await act(() => client.refetchQueries());

    await waitFor(() => expect(result.current).toBeNull());
  });

  it("does not read CapPolicy when the kill-switch is set", () => {
    featureFlagsMock.isVaultCapDisabled = true;

    const { result } = renderHook(() => useLiveVaultSlots(), {
      wrapper: buildWrapper().wrapper,
    });

    expect(result.current).toBeNull();
    expect(getAvailableLiveVaultSlots).not.toHaveBeenCalled();
  });
});
