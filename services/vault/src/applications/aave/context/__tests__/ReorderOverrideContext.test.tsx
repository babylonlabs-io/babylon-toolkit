import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ReorderOverrideProvider,
  useReorderOverride,
} from "../ReorderOverrideContext";

const VAULT_A = ("0x" + "a".repeat(64)) as `0x${string}`;
const VAULT_B = ("0x" + "b".repeat(64)) as `0x${string}`;
// The provider auto-clears the override after 90s (its internal backstop).
const OVERRIDE_TIMEOUT_MS = 90 * 1000;

function wrapper({ children }: { children: ReactNode }) {
  return <ReorderOverrideProvider>{children}</ReorderOverrideProvider>;
}

describe("ReorderOverrideContext", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts with no override", () => {
    const { result } = renderHook(() => useReorderOverride(), { wrapper });
    expect(result.current.reorderedOrder).toBeNull();
  });

  it("applyReorderedOrder sets the order", () => {
    const { result } = renderHook(() => useReorderOverride(), { wrapper });
    act(() => result.current.applyReorderedOrder([VAULT_A, VAULT_B]));
    expect(result.current.reorderedOrder).toEqual([VAULT_A, VAULT_B]);
  });

  it("auto-clears the override after the backstop timeout", () => {
    const { result } = renderHook(() => useReorderOverride(), { wrapper });
    act(() => result.current.applyReorderedOrder([VAULT_A, VAULT_B]));

    // Just before the timeout it is still held...
    act(() => vi.advanceTimersByTime(OVERRIDE_TIMEOUT_MS - 1));
    expect(result.current.reorderedOrder).not.toBeNull();

    // ...and cleared once it elapses.
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.reorderedOrder).toBeNull();
  });

  it("clearReorderedOrder clears immediately and cancels the timer", () => {
    const { result } = renderHook(() => useReorderOverride(), { wrapper });
    act(() => result.current.applyReorderedOrder([VAULT_A, VAULT_B]));
    act(() => result.current.clearReorderedOrder());
    expect(result.current.reorderedOrder).toBeNull();
  });

  it("throws when used outside the provider", () => {
    // Silence the expected React error-boundary log for this intentional throw.
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    expect(() => renderHook(() => useReorderOverride())).toThrow(
      /within a ReorderOverrideProvider/,
    );
    consoleError.mockRestore();
  });
});
