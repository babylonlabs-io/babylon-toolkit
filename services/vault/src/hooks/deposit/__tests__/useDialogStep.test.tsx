import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useDialogStep } from "../useDialogStep";

describe("useDialogStep", () => {
  it("calls reset when the dialog transitions from closed to open", () => {
    const reset = vi.fn();
    const { rerender } = renderHook(
      ({ open }) => useDialogStep(open, "form", reset),
      { initialProps: { open: false } },
    );

    expect(reset).not.toHaveBeenCalled();

    rerender({ open: true });

    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("calls reset when the dialog mounts already open", () => {
    // Covers dialogs mounted late behind blocking providers, which first
    // render with open === true and must still start from a clean slate.
    const reset = vi.fn();
    renderHook(() => useDialogStep(true, "form", reset));

    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("does not call reset on closing or on re-renders while open", () => {
    const reset = vi.fn();
    const { rerender } = renderHook(
      ({ open, step }) => useDialogStep(open, step, reset),
      { initialProps: { open: false, step: "form" } },
    );

    rerender({ open: true, step: "form" });
    expect(reset).toHaveBeenCalledTimes(1);

    // Re-render while open (e.g. step changes) — no additional reset.
    rerender({ open: true, step: "signing" });
    expect(reset).toHaveBeenCalledTimes(1);

    // Closing must not reset (reset happens on the next open instead).
    rerender({ open: false, step: "signing" });
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("freezes the rendered step while the dialog is closing", () => {
    const reset = vi.fn();
    const { result, rerender } = renderHook(
      ({ open, step }) => useDialogStep(open, step, reset),
      { initialProps: { open: true, step: "form" } },
    );

    expect(result.current).toBe("form");

    // While open, the latest step is reflected.
    rerender({ open: true, step: "signing" });
    expect(result.current).toBe("signing");

    // Once closed, the step is frozen at its last open value even if the
    // underlying step changes during the close animation.
    rerender({ open: false, step: "broadcast" });
    expect(result.current).toBe("signing");
  });
});
