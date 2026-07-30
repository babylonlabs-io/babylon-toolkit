import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const featureFlagsMock = vi.hoisted(() => ({ isGodModePanelEnabled: true }));
vi.mock("@/config/featureFlags", () => ({ default: featureFlagsMock }));

import { setDemoMarketDataEnabled, useDemoMarketData } from "../demoMarketData";

describe("useDemoMarketData", () => {
  afterEach(() => {
    featureFlagsMock.isGodModePanelEnabled = true;
    act(() => setDemoMarketDataEnabled(false));
  });

  it("is null until the panel toggle is switched on, then releases back to null", () => {
    const { result } = renderHook(() => useDemoMarketData());
    expect(result.current).toBeNull();

    act(() => setDemoMarketDataEnabled(true));
    expect(result.current).not.toBeNull();

    act(() => setDemoMarketDataEnabled(false));
    expect(result.current).toBeNull();
  });

  it("reports no override when god mode is off, even with the toggle on", () => {
    act(() => setDemoMarketDataEnabled(true));
    featureFlagsMock.isGodModePanelEnabled = false;

    const { result } = renderHook(() => useDemoMarketData());
    expect(result.current).toBeNull();
  });

  it("keys every map to a reserve in the fixture set, with exactly one degraded price and one degraded liquidity entry", () => {
    act(() => setDemoMarketDataEnabled(true));
    const { result } = renderHook(() => useDemoMarketData());
    const demo = result.current;
    expect(demo).not.toBeNull();
    if (!demo) return;

    const reserveKeys = demo.reserves.map((r) => r.reserveId.toString());
    expect(reserveKeys.length).toBeGreaterThanOrEqual(3);
    expect(Object.keys(demo.liquidityByReserveId).sort()).toEqual(
      [...reserveKeys].sort(),
    );
    expect(Object.keys(demo.aprPercentByReserveId).sort()).toEqual(
      [...reserveKeys].sort(),
    );
    expect(Object.keys(demo.pricesByReserveId).sort()).toEqual(
      [...reserveKeys].sort(),
    );

    // The degraded-state path (a failed oracle read, a failed liquidity read)
    // is the hardest to reproduce against live data, so the fixture set must
    // exercise both — exactly once each, so the "full" rows stay realistic.
    const nullPrices = Object.values(demo.pricesByReserveId).filter(
      (price) => price === null,
    );
    const nullLiquidity = Object.values(demo.liquidityByReserveId).filter(
      (liquidity) => liquidity === null,
    );
    expect(nullPrices).toHaveLength(1);
    expect(nullLiquidity).toHaveLength(1);
  });
});
