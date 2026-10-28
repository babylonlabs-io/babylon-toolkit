import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { COPY } from "@/copy";

import { useWalletScopedError } from "../useWalletScopedError";

describe("useWalletScopedError", () => {
  it("clears the error when the connected wallet changes", () => {
    const { result, rerender } = renderHook(
      ({ walletKey }) => useWalletScopedError(walletKey),
      { initialProps: { walletKey: "unisat:tb1qaaa" } },
    );

    act(() => result.current[1](COPY.wallet.liveness.extensionDisconnected));
    expect(result.current[0]).toBe(COPY.wallet.liveness.extensionDisconnected);

    rerender({ walletKey: "okx:tb1qaaa" });
    expect(result.current[0]).toBeNull();
  });

  it("keeps the error while the same wallet stays connected", () => {
    const { result, rerender } = renderHook(
      ({ walletKey }) => useWalletScopedError(walletKey),
      { initialProps: { walletKey: "unisat:tb1qaaa" } },
    );

    act(() => result.current[1](COPY.wallet.liveness.extensionDisconnected));
    rerender({ walletKey: "unisat:tb1qaaa" });

    expect(result.current[0]).toBe(COPY.wallet.liveness.extensionDisconnected);
  });
});
