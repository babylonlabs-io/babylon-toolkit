import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCreepingProgress } from "../useCreepingProgress";

const TOTAL = 1_000;

describe("useCreepingProgress", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("keeps moving while no bytes arrive, but stays within a tenth of the total ahead", () => {
    const { result } = renderHook(() => useCreepingProgress(250, TOTAL));

    act(() => vi.advanceTimersByTime(5_000));
    const afterFiveSeconds = result.current;
    expect(afterFiveSeconds).toBeGreaterThan(250);

    act(() => vi.advanceTimersByTime(600_000));
    expect(result.current).toBeGreaterThan(afterFiveSeconds);
    expect(result.current).toBeLessThanOrEqual(350);
  });

  it("never goes back when real bytes arrive behind the shown value", () => {
    const { result, rerender } = renderHook(
      ({ received }) => useCreepingProgress(received, TOTAL),
      { initialProps: { received: 250 } },
    );
    act(() => vi.advanceTimersByTime(60_000));
    const shown = result.current;

    rerender({ received: 260 });
    expect(result.current).toBe(shown);

    rerender({ received: 500 });
    expect(result.current).toBe(500);

    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current).toBeGreaterThan(500);
    expect(result.current).toBeLessThanOrEqual(600);
  });

  it("never shows the download as finished before it is", () => {
    const { result, rerender } = renderHook(
      ({ received }) => useCreepingProgress(received, TOTAL),
      { initialProps: { received: 980 } },
    );
    act(() => vi.advanceTimersByTime(600_000));
    expect(result.current).toBeLessThanOrEqual(990);

    rerender({ received: TOTAL });
    expect(result.current).toBe(TOTAL);
  });

  it("follows the real value down when the download restarts", () => {
    const { result, rerender } = renderHook(
      ({ received }) => useCreepingProgress(received, TOTAL),
      { initialProps: { received: 500 } },
    );
    act(() => vi.advanceTimersByTime(60_000));

    rerender({ received: 0 });
    expect(result.current).toBe(0);
  });

  it("drops the old creep when a retry resets the total before any byte arrives", () => {
    const { result, rerender } = renderHook(
      ({ total }) => useCreepingProgress(0, total),
      { initialProps: { total: TOTAL } },
    );
    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current).toBeGreaterThan(0);

    rerender({ total: 0 });
    rerender({ total: TOTAL });
    expect(result.current).toBe(0);
    expect(vi.getTimerCount()).toBe(1);
  });

  it("stops its timer on unmount", () => {
    const { unmount } = renderHook(() => useCreepingProgress(250, TOTAL));
    expect(vi.getTimerCount()).toBe(1);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("starts no timer while the total is unknown", () => {
    renderHook(() => useCreepingProgress(0, 0));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("shows the real value and starts no timer under reduced motion", () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    try {
      const { result } = renderHook(() => useCreepingProgress(250, TOTAL));
      act(() => vi.advanceTimersByTime(60_000));

      expect(result.current).toBe(250);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });
});
