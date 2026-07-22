import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useMidnightTick } from "../useMidnightTick";

describe("useMidnightTick", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not tick before local midnight", () => {
    vi.setSystemTime(new Date(2025, 8, 8, 23, 59, 59)); // Sep 8, 23:59:59 local
    const { result } = renderHook(() => useMidnightTick());

    expect(result.current).toBe(0);
    act(() => {
      vi.advanceTimersByTime(500); // to 23:59:59.5 — still same day
    });
    expect(result.current).toBe(0);
  });

  it("ticks once the clock crosses local midnight", () => {
    vi.setSystemTime(new Date(2025, 8, 8, 23, 59, 59));
    const { result } = renderHook(() => useMidnightTick());

    act(() => {
      vi.advanceTimersByTime(1000); // crosses into Sep 9 00:00:00
    });
    expect(result.current).toBe(1);
  });

  it("reschedules for the following midnight", () => {
    vi.setSystemTime(new Date(2025, 8, 8, 23, 59, 59));
    const { result } = renderHook(() => useMidnightTick());

    act(() => {
      vi.advanceTimersByTime(1000); // first midnight → tick 1
    });
    expect(result.current).toBe(1);

    act(() => {
      vi.advanceTimersByTime(24 * 60 * 60 * 1000); // a full day later
    });
    expect(result.current).toBe(2);
  });
});
