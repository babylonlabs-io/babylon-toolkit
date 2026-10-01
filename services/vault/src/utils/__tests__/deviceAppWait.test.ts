import { describe, expect, it, vi } from "vitest";

import { observeDeviceAppState } from "../deviceAppWait";

describe("observeDeviceAppState", () => {
  it("subscribes through the provider's affordance and returns its unsubscribe", () => {
    const unsubscribe = vi.fn();
    const subscribeDeviceAppState = vi.fn(() => unsubscribe);
    const listener = vi.fn();

    const stop = observeDeviceAppState({ subscribeDeviceAppState }, listener);

    expect(subscribeDeviceAppState).toHaveBeenCalledWith(listener);
    expect(stop).toBe(unsubscribe);
  });

  it("returns a no-op unsubscribe for a provider without the affordance", () => {
    const listener = vi.fn();

    const stop = observeDeviceAppState({}, listener);

    expect(() => stop()).not.toThrow();
    expect(listener).not.toHaveBeenCalled();
  });

  it("returns a no-op unsubscribe when no provider is connected", () => {
    expect(() => observeDeviceAppState(undefined, vi.fn())()).not.toThrow();
  });

  it("throws when the affordance returns no unsubscribe function", () => {
    const subscribeDeviceAppState = vi.fn(() => undefined);

    expect(() =>
      observeDeviceAppState({ subscribeDeviceAppState }, vi.fn()),
    ).toThrow(/must return an unsubscribe function/);
  });
});
