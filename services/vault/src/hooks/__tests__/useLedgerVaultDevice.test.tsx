import type { DeviceAppState } from "@babylonlabs-io/wallet-connector";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useLedgerVaultDevice } from "../useLedgerVaultDevice";

const device = vi.hoisted(() => ({
  listener: null as ((state: DeviceAppState) => void) | null,
  provider: {
    cancelSigning: vi.fn(),
    connectWallet: vi.fn(async () => {}),
    subscribeDeviceAppState: vi.fn(),
  },
}));

vi.mock("@babylonlabs-io/wallet-connector", () => ({
  useChainConnector: () => ({
    connectedWallet: { id: "ledger_btc_vault", provider: device.provider },
  }),
}));

beforeEach(() => {
  device.listener = null;
  device.provider.cancelSigning.mockClear();
  device.provider.subscribeDeviceAppState.mockImplementation(
    (listener: (state: DeviceAppState) => void) => {
      device.listener = listener;
      return () => {
        device.listener = null;
      };
    },
  );
});

describe("useLedgerVaultDevice", () => {
  it("reports the provider's app wait", () => {
    const { result } = renderHook(() => useLedgerVaultDevice());

    act(() =>
      device.listener?.({
        status: "awaiting-app",
        expectedAppName: "Babylon Vault Testnet",
      }),
    );

    expect(result.current.isLedgerVault).toBe(true);
    expect(result.current.appWait).toEqual({
      status: "awaiting-app",
      expectedAppName: "Babylon Vault Testnet",
    });
  });

  it("cancels a held wait when the view unmounts, so it cannot keep the device lock", () => {
    const { unmount } = renderHook(() => useLedgerVaultDevice());
    act(() =>
      device.listener?.({
        status: "awaiting-app",
        expectedAppName: "Babylon Vault Testnet",
      }),
    );

    unmount();

    expect(device.provider.cancelSigning).toHaveBeenCalledTimes(1);
  });

  it("does not cancel anything on unmount when no wait is held", () => {
    const { unmount } = renderHook(() => useLedgerVaultDevice());
    act(() => device.listener?.({ status: "ready" }));

    unmount();

    expect(device.provider.cancelSigning).not.toHaveBeenCalled();
  });
});
