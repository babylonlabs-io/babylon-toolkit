import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  calculate,
  deriveBannerState,
} from "@/applications/aave/positionNotifications";
import { getHealthFactorStatusFromValue } from "@/applications/aave/utils";

import {
  applyDebugPreset,
  DEBUG_FORCED_MAX_VAULTS,
  DEBUG_HEALTH_FACTORS,
  DEBUG_PRESETS,
  makeDefaultDebugParams,
  resetDebugManualParams,
  setDebugBorrowCapacityStateOverride,
  setDebugHealthFactorOverride,
  setDebugManualMode,
  setDebugManualParams,
  setDebugMaxVaultsOverride,
  setDebugProtocolStatusOverride,
  setDebugSimulateStalePrice,
  useDebugBorrowCapacityStateOverride,
  useDebugHealthFactorOverride,
  useDebugManualMode,
  useDebugManualParams,
  useDebugMaxVaultsOverride,
  useDebugProtocolStatusOverride,
  useDebugSimulateStalePrice,
} from "../debugPositionStore";

describe("debugPositionStore", () => {
  // Reset through the same setters production uses — the store is a module
  // singleton, so each test must leave it in its default state.
  afterEach(() => {
    setDebugManualMode(false);
    setDebugSimulateStalePrice(false);
    resetDebugManualParams();
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

    act(() => resetDebugManualParams());
    expect(result.current.btcPrice).toBe(defaultBtcPrice);
  });
});

describe("non-cascade notification overrides", () => {
  afterEach(() => {
    act(() => setDebugMaxVaultsOverride(null));
    act(() => setDebugProtocolStatusOverride(null));
  });

  it("publishes the forced max-vaults cap and releases it", () => {
    const { result } = renderHook(() => useDebugMaxVaultsOverride());
    expect(result.current).toBeNull();

    act(() => setDebugMaxVaultsOverride(DEBUG_FORCED_MAX_VAULTS));
    expect(result.current).toBe(DEBUG_FORCED_MAX_VAULTS);

    act(() => setDebugMaxVaultsOverride(null));
    expect(result.current).toBeNull();
  });

  it("publishes each protocol status and releases back to live", () => {
    const { result } = renderHook(() => useDebugProtocolStatusOverride());
    expect(result.current).toBeNull();

    act(() => setDebugProtocolStatusOverride("frozen"));
    expect(result.current).toBe("frozen");

    act(() => setDebugProtocolStatusOverride("paused"));
    expect(result.current).toBe("paused");

    act(() => setDebugProtocolStatusOverride(null));
    expect(result.current).toBeNull();
  });
});

describe("loans summary overrides", () => {
  afterEach(() => {
    act(() => setDebugHealthFactorOverride(null));
    act(() => setDebugBorrowCapacityStateOverride(null));
  });

  it("publishes the forced health factor and releases it", () => {
    const { result } = renderHook(() => useDebugHealthFactorOverride());
    expect(result.current).toBeNull();

    act(() => setDebugHealthFactorOverride(1.02));
    expect(result.current).toBe(1.02);

    act(() => setDebugHealthFactorOverride(null));
    expect(result.current).toBeNull();
  });

  it("publishes each borrow-capacity state and releases back to live", () => {
    const { result } = renderHook(() => useDebugBorrowCapacityStateOverride());

    act(() => setDebugBorrowCapacityStateOverride("loading"));
    expect(result.current).toBe("loading");

    act(() => setDebugBorrowCapacityStateOverride("error"));
    expect(result.current).toBe("error");

    act(() => setDebugBorrowCapacityStateOverride(null));
    expect(result.current).toBeNull();
  });

  it("bands every offered health factor into a distinct status", () => {
    // The panel offers one value per production band; if two collapsed to the
    // same status the control would silently stop covering a state.
    const statuses = DEBUG_HEALTH_FACTORS.map((hf) =>
      getHealthFactorStatusFromValue(hf.value),
    );
    expect(new Set(statuses).size).toBe(DEBUG_HEALTH_FACTORS.length);
  });
});

describe("DEBUG_PRESETS", () => {
  afterEach(() => {
    act(() => setDebugManualMode(false));
    act(() => resetDebugManualParams());
  });

  it.each(DEBUG_PRESETS)(
    "$label preset lands on its labelled banner severity",
    (preset) => {
      expect(deriveBannerState(calculate(preset.params)).severity).toBe(
        preset.expectedSeverity,
      );
    },
  );

  it("covers every banner severity a calculation can produce", () => {
    // "hidden" is the no-position case (nothing to show) and "yellow" also backs
    // the stale-price status, which the panel's checkbox drives instead.
    expect(new Set(DEBUG_PRESETS.map((p) => p.expectedSeverity))).toEqual(
      new Set(["red", "yellow", "soft", "green"]),
    );
  });

  it("cascades the 3-vault liquidation preset into three real groups, the last full", () => {
    // Pins the calculator's own output so a future change to calculate() or to
    // these params that collapses the cascade fails here instead of silently
    // shipping a two-event (or one-event) demo.
    const preset = DEBUG_PRESETS.find(
      (p) => p.label === "Liquidation cascade — 3 vaults",
    )!;
    const { groups } = calculate(preset.params);

    expect(groups).toHaveLength(3);
    expect(groups.at(-1)?.isFullLiquidation).toBe(true);
  });

  it("applying a preset switches manual mode on and loads its inputs", () => {
    const mode = renderHook(() => useDebugManualMode());
    const params = renderHook(() => useDebugManualParams());
    const cliff = DEBUG_PRESETS.find((p) => p.label === "Cliff")!;

    act(() => applyDebugPreset(cliff));

    expect(mode.result.current).toBe(true);
    expect(params.result.current).toEqual(cliff.params);
  });
});
