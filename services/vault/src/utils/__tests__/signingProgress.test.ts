import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import { describe, expect, it, vi } from "vitest";

import { observeSigningProgress } from "../signingProgress";

describe("observeSigningProgress", () => {
  it("subscribes through the provider's affordance and returns its unsubscribe", () => {
    const unsubscribe = vi.fn();
    const subscribeSigningProgress = vi.fn(() => unsubscribe);
    const listener = vi.fn();

    const stop = observeSigningProgress(
      { subscribeSigningProgress } as unknown as BitcoinWallet,
      listener,
    );

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

    const stop = observeSigningProgress(
      provider as unknown as BitcoinWallet,
      listener,
    );

    expect(provider.listeners.has(listener)).toBe(true);
    stop();
    expect(provider.listeners.has(listener)).toBe(false);
  });

  it("returns a no-op for a provider without the affordance", () => {
    const stop = observeSigningProgress(
      { signPsbt: vi.fn() } as unknown as BitcoinWallet,
      vi.fn(),
    );

    expect(() => stop()).not.toThrow();
  });

  it("throws at subscribe time when the affordance returns no unsubscribe function", () => {
    expect(() =>
      observeSigningProgress(
        {
          subscribeSigningProgress: () => undefined,
        } as unknown as BitcoinWallet,
        vi.fn(),
      ),
    ).toThrow(
      "provider.subscribeSigningProgress must return an unsubscribe function; got undefined",
    );
  });
});
