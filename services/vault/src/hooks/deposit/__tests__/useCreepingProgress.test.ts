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
});
