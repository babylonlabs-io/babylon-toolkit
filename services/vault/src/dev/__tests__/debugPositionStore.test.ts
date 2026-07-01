import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { CalculatorResult } from "@/applications/aave/positionNotifications";

import {
  makeDefaultDebugParams,
  resetDebugPositionState,
  setDebugManualMode,
  setDebugManualParams,
  setDebugPositionOverride,
  setDebugSimulateStalePrice,
  useDebugManualMode,
  useDebugManualParams,
  useDebugPositionOverride,
  useDebugSimulateStalePrice,
} from "../debugPositionStore";

// Opaque identity token — the store only stores/compares the reference, so the
// full CalculatorResult shape is irrelevant to these tests.
const RESULT_DOUBLE = { currentHF: 1.23 } as unknown as CalculatorResult;

describe("debugPositionStore", () => {
  afterEach(() => {
    resetDebugPositionState();
  });

  it("reflects the manual-mode and stale-price toggles", () => {
    const manual = renderHook(() => useDebugManualMode());
    const stale = renderHook(() => useDebugSimulateStalePrice());
    expect(manual.result.current).toBe(false);
    expect(stale.result.current).toBe(false);

    act(() => setDebugManualMode(true));
    act(() => setDebugSimulateStalePrice(true));
    expect(manual.result.current).toBe(true);
    expect(stale.result.current).toBe(true);
  });

  it("updates the manual params and resets them to defaults", () => {
    const { result } = renderHook(() => useDebugManualParams());
    const defaultBtcPrice = makeDefaultDebugParams().btcPrice;
    expect(result.current.btcPrice).toBe(defaultBtcPrice);

    act(() =>
      setDebugManualParams({ ...makeDefaultDebugParams(), btcPrice: 12345 }),
    );
    expect(result.current.btcPrice).toBe(12345);

    act(() => resetDebugPositionState());
    expect(result.current.btcPrice).toBe(defaultBtcPrice);
  });

  it("publishes the banner override for the dashboard to read", () => {
    const { result } = renderHook(() => useDebugPositionOverride());
    expect(result.current).toEqual({ result: null, status: null });

    act(() => setDebugPositionOverride(RESULT_DOUBLE, null));
    expect(result.current).toEqual({ result: RESULT_DOUBLE, status: null });

    act(() => setDebugPositionOverride(null, "stale-price"));
    expect(result.current).toEqual({ result: null, status: "stale-price" });
  });

  it("keeps the same snapshot when the override is unchanged (reference guard)", () => {
    const { result } = renderHook(() => useDebugPositionOverride());

    act(() => setDebugPositionOverride(null, "stale-price"));
    const first = result.current;

    // Same values → identical snapshot, so subscribers don't churn.
    act(() => setDebugPositionOverride(null, "stale-price"));
    expect(result.current).toBe(first);

    // A changed value → a fresh snapshot.
    act(() => setDebugPositionOverride(null, "loading"));
    expect(result.current).not.toBe(first);
    expect(result.current.status).toBe("loading");
  });
});
