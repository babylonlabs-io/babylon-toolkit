import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useVaultsPageEmptiness } from "@/hooks/useVaultsPageEmptiness";

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

const depositsState = vi.hoisted(() => ({
  pendingActivities: [] as unknown[],
  expiredActivities: [] as unknown[],
  isLoading: false,
  error: null as Error | null,
}));

vi.mock("@/hooks/usePendingDeposits", () => ({
  usePendingDeposits: () => depositsState,
}));

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

    const { result } = renderHook(() => useVaultsPageEmptiness());

    expect(result.current).toEqual({
      isLoading: false,
      isEmpty: true,
      hasError: false,
    });
  });

  it("is empty while disconnected even when ETH-keyed queries returned deposits", () => {
    walletState.isConnected = false;
    depositsState.pendingActivities = [{ id: "pending-1" }];

    const { result } = renderHook(() => useVaultsPageEmptiness());

    expect(result.current.isEmpty).toBe(true);
  });

  it("passes undefined to useDashboardState while disconnected", () => {
    walletState.isConnected = false;

    renderHook(() => useVaultsPageEmptiness());

    expect(useDashboardStateMock).toHaveBeenCalledWith(undefined);
  });

  it("passes the wallet address to useDashboardState while connected", () => {
    renderHook(() => useVaultsPageEmptiness());

    expect(useDashboardStateMock).toHaveBeenCalledWith("0xdepositor");
  });

  it("is loading, not empty, while the position query resolves", () => {
    dashboardState.isLoading = true;

    const { result } = renderHook(() => useVaultsPageEmptiness());

    expect(result.current).toEqual({
      isLoading: true,
      isEmpty: false,
      hasError: false,
    });
  });

  it("is loading, not empty, while the deposits query resolves", () => {
    depositsState.isLoading = true;

    const { result } = renderHook(() => useVaultsPageEmptiness());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.isEmpty).toBe(false);
  });

  it("is not empty when the account has display collateral", () => {
    dashboardState.hasDisplayCollateral = true;

    const { result } = renderHook(() => useVaultsPageEmptiness());

    expect(result.current.isEmpty).toBe(false);
  });

  it("is not empty when a deposit is pending", () => {
    depositsState.pendingActivities = [{ id: "pending-1" }];

    const { result } = renderHook(() => useVaultsPageEmptiness());

    expect(result.current.isEmpty).toBe(false);
  });

  it("is not empty when an expired deposit awaits refund", () => {
    depositsState.expiredActivities = [{ id: "expired-1" }];

    const { result } = renderHook(() => useVaultsPageEmptiness());

    expect(result.current.isEmpty).toBe(false);
  });

  it("is empty when connected with no vaults and no deposits", () => {
    const { result } = renderHook(() => useVaultsPageEmptiness());

    expect(result.current).toEqual({
      isLoading: false,
      isEmpty: true,
      hasError: false,
    });
  });

  it("reports an error, never an empty account, when the position read failed", () => {
    dashboardState.positionError = new Error("rpc down");

    const { result } = renderHook(() => useVaultsPageEmptiness());

    expect(result.current).toEqual({
      isLoading: false,
      isEmpty: false,
      hasError: true,
    });
  });

  it("reports an error, never an empty account, when the deposits read failed", () => {
    depositsState.error = new Error("indexer down");

    const { result } = renderHook(() => useVaultsPageEmptiness());

    expect(result.current.hasError).toBe(true);
    expect(result.current.isEmpty).toBe(false);
  });

  it("prefers showable data over a failed read from the other source", () => {
    dashboardState.positionError = new Error("rpc down");
    depositsState.pendingActivities = [{ id: "pending-1" }];

    const { result } = renderHook(() => useVaultsPageEmptiness());

    expect(result.current).toEqual({
      isLoading: false,
      isEmpty: false,
      hasError: false,
    });
  });

  it("ignores query errors while disconnected", () => {
    walletState.isConnected = false;
    depositsState.error = new Error("indexer down");

    const { result } = renderHook(() => useVaultsPageEmptiness());

    expect(result.current).toEqual({
      isLoading: false,
      isEmpty: true,
      hasError: false,
    });
  });
});
