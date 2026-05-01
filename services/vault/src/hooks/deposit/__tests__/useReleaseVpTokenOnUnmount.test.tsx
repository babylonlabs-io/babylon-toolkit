import { vpTokenRegistry } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useReleaseVpTokenOnUnmount } from "../useReleaseVpTokenOnUnmount";

describe("useReleaseVpTokenOnUnmount", () => {
  beforeEach(() => {
    vi.spyOn(vpTokenRegistry, "release");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("releases the tracked txid on unmount", () => {
    const { result, unmount } = renderHook(() => useReleaseVpTokenOnUnmount());
    result.current("a".repeat(64));

    expect(vpTokenRegistry.release).not.toHaveBeenCalled();

    unmount();

    expect(vpTokenRegistry.release).toHaveBeenCalledExactlyOnceWith(
      "a".repeat(64),
    );
  });

  it("does not release when no txid was ever tracked (failed prime)", () => {
    const { unmount } = renderHook(() => useReleaseVpTokenOnUnmount());
    unmount();

    expect(vpTokenRegistry.release).not.toHaveBeenCalled();
  });

  it("releases the most recently tracked txid (caller may overwrite)", () => {
    const { result, unmount } = renderHook(() => useReleaseVpTokenOnUnmount());
    result.current("a".repeat(64));
    result.current("b".repeat(64));

    unmount();

    expect(vpTokenRegistry.release).toHaveBeenCalledExactlyOnceWith(
      "b".repeat(64),
    );
  });
});
