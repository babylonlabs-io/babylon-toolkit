import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  calculate,
  deriveBannerState,
  type CalculatorResult,
} from "@/applications/aave/positionNotifications";

// The two non-cascade overrides are read by production components, so the store
// additionally gates them on the god-mode flag (see debugPositionStore).
const featureFlagsMock = vi.hoisted(() => ({ isGodModePanelEnabled: true }));
vi.mock("@/config/featureFlags", () => ({ default: featureFlagsMock }));

import {
  applyDebugPreset,
  DEBUG_FORCED_MAX_VAULTS,
  DEBUG_PRESETS,
  makeDefaultDebugParams,
  resetDebugManualParams,
  setDebugManualMode,
  setDebugManualParams,
  setDebugMaxVaultsOverride,
  setDebugPositionOverride,
  setDebugProtocolStatusOverride,
  setDebugSimulateStalePrice,
  useDebugManualMode,
  useDebugManualParams,
  useDebugMaxVaultsOverride,
  useDebugPositionOverride,
  useDebugProtocolStatusOverride,
  useDebugSimulateStalePrice,
} from "../debugPositionStore";

// Opaque identity token — the store only stores/compares the reference, so the
// full CalculatorResult shape is irrelevant to these tests.
const RESULT_DOUBLE = { currentHF: 1.23 } as unknown as CalculatorResult;

describe("debugPositionStore", () => {
  // Reset through the same setters production uses — the store is a module
  // singleton, so each test must leave it in its default state.
  afterEach(() => {
    setDebugManualMode(false);
    setDebugSimulateStalePrice(false);
    resetDebugManualParams();
    setDebugPositionOverride(null, null);
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

describe("non-cascade notification overrides", () => {
  afterEach(() => {
    featureFlagsMock.isGodModePanelEnabled = true;
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

  it("reports no override when god mode is off, whatever was written", () => {
    act(() => setDebugMaxVaultsOverride(DEBUG_FORCED_MAX_VAULTS));
    act(() => setDebugProtocolStatusOverride("paused"));

    featureFlagsMock.isGodModePanelEnabled = false;

    const cap = renderHook(() => useDebugMaxVaultsOverride());
    const status = renderHook(() => useDebugProtocolStatusOverride());
    expect(cap.result.current).toBeNull();
    expect(status.result.current).toBeNull();
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

  it("applying a preset switches manual mode on and loads its inputs", () => {
    const mode = renderHook(() => useDebugManualMode());
    const params = renderHook(() => useDebugManualParams());
    const cliff = DEBUG_PRESETS.find((p) => p.label === "Cliff")!;

    act(() => applyDebugPreset(cliff));

    expect(mode.result.current).toBe(true);
    expect(params.result.current).toEqual(cliff.params);
  });
});
