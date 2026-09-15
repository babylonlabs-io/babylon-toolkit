import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { APPKIT_BTC_CONNECTOR_ID } from "@/core/wallets/appkit/constants";

import { useAppKitBtcBridge } from "../useAppKitBtcBridge";

const harness = vi.hoisted(() => ({
  connectedWalletId: "",
  disconnect: vi.fn().mockResolvedValue(undefined),
}));

// AppKit already reports bip122 disconnected.
vi.mock("@reown/appkit/react", () => ({
  useAppKitAccount: () => ({ isConnected: false, address: undefined, allAccounts: [] }),
}));
vi.mock("@/hooks/useChainConnector", () => ({
  useChainConnector: () => ({ connectedWallet: { id: harness.connectedWalletId }, disconnect: harness.disconnect }),
}));

beforeEach(() => {
  harness.disconnect.mockClear();
});

describe("useAppKitBtcBridge", () => {
  it("drops the connector's wallet locally once AppKit reports bitcoin disconnected", () => {
    harness.connectedWalletId = APPKIT_BTC_CONNECTOR_ID;

    renderHook(() => useAppKitBtcBridge());

    expect(harness.disconnect).toHaveBeenCalledTimes(1);
    expect(harness.disconnect).toHaveBeenCalledWith("local");
  });

  it("leaves a non-AppKit bitcoin wallet alone when AppKit reports bitcoin disconnected", () => {
    harness.connectedWalletId = "unisat";

    renderHook(() => useAppKitBtcBridge());

    expect(harness.disconnect).not.toHaveBeenCalled();
  });
});
