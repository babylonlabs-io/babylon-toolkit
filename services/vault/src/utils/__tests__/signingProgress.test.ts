import { describe, expect, it, vi } from "vitest";

import { observeSigningProgress } from "../signingProgress";

describe("observeSigningProgress", () => {
  it("subscribes through the provider's affordance and returns its unsubscribe", () => {
    const unsubscribe = vi.fn();
    const subscribeSigningProgress = vi.fn(() => unsubscribe);
    const listener = vi.fn();

    const stop = observeSigningProgress({ subscribeSigningProgress }, listener);

    expect(subscribeSigningProgress).toHaveBeenCalledWith(listener);
    expect(stop).toBe(unsubscribe);
  });

  it("calls a prototype-method affordance through the provider so `this` resolves", () => {
    class PrototypeProvider {
      readonly listeners = new Set<(p: unknown) => void>();
      subscribeSigningProgress(listener: (p: unknown) => void) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
      }
    }
    const provider = new PrototypeProvider();
    const listener = vi.fn();

    const stop = observeSigningProgress(provider, listener);

    expect(provider.listeners.has(listener)).toBe(true);
    stop();
    expect(provider.listeners.has(listener)).toBe(false);
  });

  it("returns a no-op for a provider without the affordance", () => {
    const stop = observeSigningProgress({ signPsbt: vi.fn() }, vi.fn());

    expect(() => stop()).not.toThrow();
  });

  it("returns a no-op for a null provider", () => {
    const stop = observeSigningProgress(null, vi.fn());

    expect(() => stop()).not.toThrow();
  });
});
