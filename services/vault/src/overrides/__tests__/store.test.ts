import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const featureFlagsMock = vi.hoisted(() => ({ isGodModePanelEnabled: true }));
vi.mock("@/config/featureFlags", () => ({ default: featureFlagsMock }));

import { createOverrideStore } from "../store";

interface TestValue {
  value: number;
}

describe("createOverrideStore", () => {
  afterEach(() => {
    featureFlagsMock.isGodModePanelEnabled = true;
  });

  it("returns null from get()/useValue() when the god-mode flag is off", () => {
    const store = createOverrideStore<TestValue>();
    store.set({ value: 1 });
    featureFlagsMock.isGodModePanelEnabled = false;

    expect(store.get()).toBeNull();
    const { result } = renderHook(() => store.useValue());
    expect(result.current).toBeNull();
  });

  it("returns the stored value from get()/useValue() when the flag is on", () => {
    const store = createOverrideStore<TestValue>();
    const value = { value: 1 };
    store.set(value);

    expect(store.get()).toBe(value);
    const { result } = renderHook(() => store.useValue());
    expect(result.current).toBe(value);
  });

  it("set() is a no-op for an identical value — subscribers are not re-notified", () => {
    const store = createOverrideStore<TestValue>();
    let renderCount = 0;
    renderHook(() => {
      renderCount += 1;
      return store.useValue();
    });
    const value = { value: 1 };

    act(() => store.set(value));
    expect(renderCount).toBe(2);

    act(() => store.set(value));
    expect(renderCount).toBe(2);
  });
});
