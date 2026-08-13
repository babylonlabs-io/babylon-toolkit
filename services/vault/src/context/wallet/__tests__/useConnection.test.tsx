import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useConnection } from "../useConnection";
import { useRequireBtcWallet } from "../useRequireBtcWallet";

const wallet = vi.hoisted(() => ({
  btcConnected: false,
  ethConnected: false,
  sessionConfirmed: false,
  open: vi.fn(),
}));

vi.mock("@babylonlabs-io/wallet-connector", () => ({
  useBTCWallet: () => ({ connected: wallet.btcConnected }),
  useETHWallet: () => ({ connected: wallet.ethConnected }),
  useWalletConnect: () => ({
    connected: wallet.sessionConfirmed,
    open: wallet.open,
  }),
}));

describe("vault wallet connection signals", () => {
  beforeEach(() => {
    wallet.btcConnected = false;
    wallet.ethConnected = false;
    wallet.sessionConfirmed = false;
    wallet.open.mockClear();
  });

  it("does not treat a raw ETH provider as connected before confirmation", () => {
    wallet.ethConnected = true;

    const { result } = renderHook(() => useConnection());

    expect(result.current).toEqual({
      isConnected: false,
      isFullyConnected: false,
      btcConnected: false,
      ethConnected: true,
    });
  });

  it("treats confirmed ETH-only as connected but not fully connected", () => {
    wallet.ethConnected = true;
    wallet.sessionConfirmed = true;

    const { result } = renderHook(() => useConnection());

    expect(result.current).toEqual({
      isConnected: true,
      isFullyConnected: false,
      btcConnected: false,
      ethConnected: true,
    });
  });

  it("reports full connection only when both chains are connected", () => {
    wallet.ethConnected = true;
    wallet.btcConnected = true;
    wallet.sessionConfirmed = true;

    const { result } = renderHook(() => useConnection());

    expect(result.current.isFullyConnected).toBe(true);
  });

  it("opens the connector directly on BTC and stops the guarded action", () => {
    const { result } = renderHook(() => useRequireBtcWallet());

    let canContinue = true;
    act(() => {
      canContinue = result.current.requireBtcWallet();
    });

    expect(canContinue).toBe(false);
    expect(wallet.open).toHaveBeenCalledWith("BTC");
  });

  it("allows the guarded action without reopening when BTC is connected", () => {
    wallet.btcConnected = true;
    const { result } = renderHook(() => useRequireBtcWallet());

    expect(result.current.requireBtcWallet()).toBe(true);
    expect(wallet.open).not.toHaveBeenCalled();
  });
});
