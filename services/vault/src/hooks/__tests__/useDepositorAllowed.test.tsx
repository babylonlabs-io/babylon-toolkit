import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

afterEach(() => {
  vi.useRealTimers();
});

describe("useDepositorAllowed", () => {
  it("reads the list once and keeps the answer without re-reading while polling is off", async () => {
    vi.useFakeTimers();
    vi.mocked(readDepositorAllowed).mockResolvedValue(false);

    const { result } = renderHook(
      () => useDepositorAllowed(APP, DEPOSITOR, false),
      { wrapper: buildWrapper().wrapper },
    );
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(result.current).toBe(false);

    await act(() => vi.advanceTimersByTimeAsync(180_000));

    expect(readDepositorAllowed).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(false);
  });

  it("re-reads the list every minute while polling is on", async () => {
    vi.useFakeTimers();
    vi.mocked(readDepositorAllowed).mockResolvedValue(false);

    renderHook(() => useDepositorAllowed(APP, DEPOSITOR, true), {
      wrapper: buildWrapper().wrapper,
    });
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(readDepositorAllowed).toHaveBeenCalledTimes(1);

    await act(() => vi.advanceTimersByTimeAsync(60_000));

    expect(readDepositorAllowed).toHaveBeenCalledTimes(2);
  });

  it("shows the earlier answer and re-reads it when polling turns on after it went stale", async () => {
    vi.useFakeTimers();
    vi.mocked(readDepositorAllowed)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const { result, rerender } = renderHook(
      ({ poll }: { poll: boolean }) =>
        useDepositorAllowed(APP, DEPOSITOR, poll),
      { wrapper: buildWrapper().wrapper, initialProps: { poll: false } },
    );
    await act(() => vi.advanceTimersByTimeAsync(0));
    await act(() => vi.advanceTimersByTimeAsync(31_000));

    rerender({ poll: true });
    expect(result.current).toBe(false);
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(result.current).toBe(true);
    expect(readDepositorAllowed).toHaveBeenCalledTimes(2);
  });

  it("stops re-reading once polling turns off", async () => {
    vi.useFakeTimers();
    vi.mocked(readDepositorAllowed).mockResolvedValue(false);

    const { result, rerender } = renderHook(
      ({ poll }: { poll: boolean }) =>
        useDepositorAllowed(APP, DEPOSITOR, poll),
      { wrapper: buildWrapper().wrapper, initialProps: { poll: true } },
    );
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(readDepositorAllowed).toHaveBeenCalledTimes(1);

    rerender({ poll: false });
    await act(() => vi.advanceTimersByTimeAsync(180_000));

    expect(readDepositorAllowed).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(false);
  });

  it("keeps re-reading while polling is off until a read succeeds, then stops", async () => {
    vi.useFakeTimers();
    vi.mocked(readDepositorAllowed)
      .mockRejectedValueOnce(new Error("rpc unavailable"))
      .mockResolvedValue(false);

    const { result } = renderHook(
      () => useDepositorAllowed(APP, DEPOSITOR, false),
      { wrapper: buildWrapper().wrapper },
    );
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(result.current).toBeNull();

    await act(() => vi.advanceTimersByTimeAsync(61_000));
    expect(result.current).toBe(false);
    expect(readDepositorAllowed).toHaveBeenCalledTimes(2);

    await act(() => vi.advanceTimersByTimeAsync(180_000));
    expect(readDepositorAllowed).toHaveBeenCalledTimes(2);
  });

  it("re-reads after polling turns off when the last read had failed", async () => {
    vi.useFakeTimers();
    vi.mocked(readDepositorAllowed)
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(new Error("rpc unavailable"))
      .mockResolvedValue(false);

    const { result, rerender } = renderHook(
      ({ poll }: { poll: boolean }) =>
        useDepositorAllowed(APP, DEPOSITOR, poll),
      { wrapper: buildWrapper().wrapper, initialProps: { poll: true } },
    );
    await act(() => vi.advanceTimersByTimeAsync(0));
    await act(() => vi.advanceTimersByTimeAsync(61_000));
    expect(result.current).toBeNull();

    rerender({ poll: false });
    await act(() => vi.advanceTimersByTimeAsync(61_000));

    expect(result.current).toBe(false);
    expect(readDepositorAllowed).toHaveBeenCalledTimes(3);
  });

  it("asks the allow-list about the connected account in the deposit's application", async () => {
    vi.mocked(readDepositorAllowed).mockResolvedValue(true);

    const { result } = renderHook(
      () => useDepositorAllowed(APP, DEPOSITOR, true),
      {
        wrapper: buildWrapper().wrapper,
      },
    );

    await waitFor(() => expect(result.current).toBe(true));
    expect(readDepositorAllowed).toHaveBeenCalledWith({
      applicationEntryPoint: APP,
      depositor: DEPOSITOR,
    });
  });

  it("returns false when the chain says the account is not on the allow-list", async () => {
    vi.mocked(readDepositorAllowed).mockResolvedValue(false);

    const { result } = renderHook(
      () => useDepositorAllowed(APP, DEPOSITOR, true),
      {
        wrapper: buildWrapper().wrapper,
      },
    );

    await waitFor(() => expect(result.current).toBe(false));
  });

  it("returns null while the first read is in flight, so the deposit is not blocked", async () => {
    vi.mocked(readDepositorAllowed).mockImplementation(
      () => new Promise(() => {}),
    );

    const { result } = renderHook(
      () => useDepositorAllowed(APP, DEPOSITOR, true),
      {
        wrapper: buildWrapper().wrapper,
      },
    );

    await waitFor(() => expect(readDepositorAllowed).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it("returns null once a read fails, even after an earlier read found the account unlisted", async () => {
    vi.mocked(readDepositorAllowed)
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(new Error("rpc unavailable"));
    const { client, wrapper } = buildWrapper();

    const { result } = renderHook(
      () => useDepositorAllowed(APP, DEPOSITOR, true),
      {
        wrapper,
      },
    );
    await waitFor(() => expect(result.current).toBe(false));

    await act(() => client.refetchQueries());

    await waitFor(() => expect(result.current).toBeNull());
  });

  it("does not read the allow-list while no Ethereum account is connected", () => {
    const { result } = renderHook(
      () => useDepositorAllowed(APP, undefined, true),
      {
        wrapper: buildWrapper().wrapper,
      },
    );

    expect(result.current).toBeNull();
    expect(readDepositorAllowed).not.toHaveBeenCalled();
  });

  it("does not read the allow-list before the deposit's application is known", () => {
    const { result } = renderHook(
      () => useDepositorAllowed("", DEPOSITOR, true),
      {
        wrapper: buildWrapper().wrapper,
      },
    );

    expect(result.current).toBeNull();
    expect(readDepositorAllowed).not.toHaveBeenCalled();
  });
});
