import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSustainedFlag } from "../useSustainedFlag";

const DELAY = 60_000;

describe("useSustainedFlag", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stays false until the active condition has persisted for the delay", () => {
    const { result } = renderHook(() => useSustainedFlag(true, DELAY));
    expect(result.current).toBe(false);

    act(() => {
      vi.advanceTimersByTime(DELAY - 1);
    });
    expect(result.current).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(true);
  });

  it("is always false while inactive", () => {
    const { result } = renderHook(() => useSustainedFlag(false, DELAY));
    act(() => {
      vi.advanceTimersByTime(DELAY * 2);
    });
    expect(result.current).toBe(false);
  });

  it("resets the timer when the condition clears before the delay", () => {
    const { result, rerender } = renderHook(
      ({ active }) => useSustainedFlag(active, DELAY),
      { initialProps: { active: true } },
    );

    act(() => {
      vi.advanceTimersByTime(DELAY - 5_000);
    });
    expect(result.current).toBe(false);

    // Condition clears (e.g. a transient blip recovered) — timer resets.
    rerender({ active: false });
    expect(result.current).toBe(false);

    // Becomes active again: the full delay must elapse afresh.
    rerender({ active: true });
    act(() => {
      vi.advanceTimersByTime(DELAY - 1);
    });
    expect(result.current).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(true);
  });
});
