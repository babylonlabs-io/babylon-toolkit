import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setVisibleTimeout } from "../visibleTimeout";

const setVisibility = (state: DocumentVisibilityState) => {
  vi.spyOn(document, "visibilityState", "get").mockReturnValue(state);
  document.dispatchEvent(new Event("visibilitychange"));
};

describe("setVisibleTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("fires after 60 s while the page stays visible", () => {
    const callback = vi.fn();
    setVisibleTimeout(callback, 60_000);

    vi.advanceTimersByTime(59_999);
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("does not count hidden time, so a user approving in the wallet app is not rejected", () => {
    const callback = vi.fn();
    setVisibleTimeout(callback, 60_000);

    vi.advanceTimersByTime(10_000);
    setVisibility("hidden");
    vi.advanceTimersByTime(70_000);
    expect(callback).not.toHaveBeenCalled();

    setVisibility("visible");
    vi.advanceTimersByTime(49_999);
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("never fires after cancel, even when the page hides and shows again", () => {
    const callback = vi.fn();
    const cancel = setVisibleTimeout(callback, 60_000);

    cancel();
    setVisibility("hidden");
    setVisibility("visible");
    vi.advanceTimersByTime(120_000);

    expect(callback).not.toHaveBeenCalled();
  });
});
