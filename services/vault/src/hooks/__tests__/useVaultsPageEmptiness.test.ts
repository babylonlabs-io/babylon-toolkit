import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useVaultsPageEmptiness } from "@/hooks/useVaultsPageEmptiness";
import type { VaultActivity } from "@/types/activity";

const walletState = vi.hoisted(() => ({
  isConnected: true,
  address: "0xdepositor" as string | undefined,
}));

vi.mock("@/context/wallet", () => ({
  useConnection: () => ({ isConnected: walletState.isConnected }),
  useETHWallet: () => ({ address: walletState.address }),
}));

const dashboardState = vi.hoisted(() => ({
  hasDisplayCollateral: false,
  isLoading: false,
  positionError: null as Error | null,
}));

const useDashboardStateMock = vi.hoisted(() => vi.fn(() => dashboardState));

vi.mock("@/hooks/useDashboardState", () => ({
  useDashboardState: useDashboardStateMock,
}));

// Passed straight into the hook — the page hands over its single
// usePendingDeposits result the same way, so no module mock is needed.
const depositsState = {
  pendingActivities: [] as VaultActivity[],
  expiredActivities: [] as VaultActivity[],
  isLoading: false,
  error: null as Error | null,
};

const stubActivity = (id: string) => ({ id }) as VaultActivity;

describe("useVaultsPageEmptiness", () => {
  beforeEach(() => {
    walletState.isConnected = true;
    walletState.address = "0xdepositor";
    dashboardState.hasDisplayCollateral = false;
    dashboardState.isLoading = false;
    dashboardState.positionError = null;
    depositsState.pendingActivities = [];
    depositsState.expiredActivities = [];
    depositsState.isLoading = false;
    depositsState.error = null;
    useDashboardStateMock.mockClear();
  });

  it("is empty and not loading while disconnected", () => {
    walletState.isConnected = false;

    const { result } = renderHook(() => useVaultsPageEmptiness(depositsState));

    expect(result.current).toEqual({
      isLoading: false,
      isEmpty: true,
      hasError: false,
      hasPartialError: false,
    });
  });

  it("is empty while disconnected even when ETH-keyed queries returned deposits", () => {
    walletState.isConnected = false;
    depositsState.pendingActivities = [stubActivity("pending-1")];

    const { result } = renderHook(() => useVaultsPageEmptiness(depositsState));

    expect(result.current.isEmpty).toBe(true);
  });

  it("passes undefined to useDashboardState while disconnected", () => {
    walletState.isConnected = false;

    renderHook(() => useVaultsPageEmptiness(depositsState));

    expect(useDashboardStateMock).toHaveBeenCalledWith(undefined);
  });

  it("passes the wallet address to useDashboardState while connected", () => {
    renderHook(() => useVaultsPageEmptiness(depositsState));

    expect(useDashboardStateMock).toHaveBeenCalledWith("0xdepositor");
  });

  it("is loading, not empty, while the position query resolves", () => {
    dashboardState.isLoading = true;

    const { result } = renderHook(() => useVaultsPageEmptiness(depositsState));

    expect(result.current).toEqual({
      isLoading: true,
      isEmpty: false,
      hasError: false,
      hasPartialError: false,
    });
  });

  it("is loading, not empty, while the deposits query resolves", () => {
    depositsState.isLoading = true;

    const { result } = renderHook(() => useVaultsPageEmptiness(depositsState));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.isEmpty).toBe(false);
  });

  it("is not empty when the account has display collateral", () => {
    dashboardState.hasDisplayCollateral = true;

    const { result } = renderHook(() => useVaultsPageEmptiness(depositsState));

    expect(result.current.isEmpty).toBe(false);
  });

  it("is not empty when a deposit is pending", () => {
    depositsState.pendingActivities = [stubActivity("pending-1")];

    const { result } = renderHook(() => useVaultsPageEmptiness(depositsState));

    expect(result.current.isEmpty).toBe(false);
  });

  it("is not empty when an expired deposit awaits refund", () => {
    depositsState.expiredActivities = [stubActivity("expired-1")];

    const { result } = renderHook(() => useVaultsPageEmptiness(depositsState));

    expect(result.current.isEmpty).toBe(false);
  });

  it("is empty when connected with no vaults and no deposits", () => {
    const { result } = renderHook(() => useVaultsPageEmptiness(depositsState));

    expect(result.current).toEqual({
      isLoading: false,
      isEmpty: true,
      hasError: false,
      hasPartialError: false,
    });
  });

  it("reports an error, never an empty account, when the position read failed", () => {
    dashboardState.positionError = new Error("rpc down");

    const { result } = renderHook(() => useVaultsPageEmptiness(depositsState));

    expect(result.current).toEqual({
      isLoading: false,
      isEmpty: false,
      hasError: true,
      hasPartialError: false,
    });
  });

  it("reports an error, never an empty account, when the deposits read failed", () => {
    depositsState.error = new Error("indexer down");

    const { result } = renderHook(() => useVaultsPageEmptiness(depositsState));

    expect(result.current.hasError).toBe(true);
    expect(result.current.isEmpty).toBe(false);
  });

  it("prefers showable data over a failed read from the other source", () => {
    dashboardState.positionError = new Error("rpc down");
    depositsState.pendingActivities = [stubActivity("pending-1")];

    const { result } = renderHook(() => useVaultsPageEmptiness(depositsState));

    expect(result.current).toEqual({
      isLoading: false,
      isEmpty: false,
      hasError: false,
      hasPartialError: true,
    });
  });

  it("flags a partial error when the deposits read failed but collateral is showable", () => {
    dashboardState.hasDisplayCollateral = true;
    depositsState.error = new Error("indexer down");

    const { result } = renderHook(() => useVaultsPageEmptiness(depositsState));

    expect(result.current.hasPartialError).toBe(true);
    expect(result.current.hasError).toBe(false);
    expect(result.current.isEmpty).toBe(false);
  });

  it("does not flag a partial error when both sources loaded cleanly", () => {
    dashboardState.hasDisplayCollateral = true;

    const { result } = renderHook(() => useVaultsPageEmptiness(depositsState));

    expect(result.current.hasPartialError).toBe(false);
  });

  it("does not flag a partial error alongside the full-page error state", () => {
    // Nothing showable + a failed read is the full-page hasError case; the
    // partial flag must not also fire or the page would try to render both.
    dashboardState.positionError = new Error("rpc down");

    const { result } = renderHook(() => useVaultsPageEmptiness(depositsState));

    expect(result.current.hasError).toBe(true);
    expect(result.current.hasPartialError).toBe(false);
  });

  it("ignores query errors while disconnected", () => {
    walletState.isConnected = false;
    depositsState.error = new Error("indexer down");

    const { result } = renderHook(() => useVaultsPageEmptiness(depositsState));

    expect(result.current).toEqual({
      isLoading: false,
      isEmpty: true,
      hasError: false,
      hasPartialError: false,
    });
  });
});
