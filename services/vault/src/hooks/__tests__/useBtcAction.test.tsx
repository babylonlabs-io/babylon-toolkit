import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useBtcAction } from "../useBtcAction";

const wallet = vi.hoisted(() => {
  const state = {
    connected: true,
    confirmed: true,
    loading: false,
    locked: false,
    open: vi.fn(),
    reconnect: vi.fn(),
  };
  const useBTCWallet = () => ({
    connected: state.connected,
    loading: state.loading,
    locked: state.locked,
    reconnect: state.reconnect,
  });
  return { state, useBTCWallet };
});

vi.mock("@babylonlabs-io/wallet-connector", () => ({
  useBTCWallet: wallet.useBTCWallet,
  useWalletConnect: () => ({
    connected: wallet.state.confirmed,
    open: wallet.state.open,
  }),
  isUserRejectionMessage: () => false,
}));

vi.mock("@/context/wallet", () => ({
  useBTCWallet: wallet.useBTCWallet,
}));

vi.mock("@/infrastructure", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

describe("useBtcAction", () => {
  beforeEach(() => {
    wallet.state.connected = true;
    wallet.state.confirmed = true;
    wallet.state.loading = false;
    wallet.state.locked = false;
    wallet.state.open.mockClear();
    wallet.state.reconnect.mockReset();
    wallet.state.reconnect.mockResolvedValue(undefined);
  });

  it("passes without opening the dialog when Bitcoin is connected and the session is confirmed", () => {
    const { result } = renderHook(() => useBtcAction());
    expect(result.current.connected).toBe(true);
    expect(result.current.requireBtcWallet()).toBe(true);
    expect(wallet.state.open).not.toHaveBeenCalled();
  });

  it("opens the Bitcoin wallet list when no Bitcoin wallet is connected", () => {
    wallet.state.connected = false;
    const { result } = renderHook(() => useBtcAction());
    expect(result.current.btcConnected).toBe(false);
    expect(result.current.requireBtcWallet()).toBe(false);
    expect(wallet.state.open).toHaveBeenCalledWith("BTC");
  });

  it("opens the confirm step when Bitcoin is connected but the session is unconfirmed", () => {
    wallet.state.confirmed = false;
    const { result } = renderHook(() => useBtcAction());
    expect(result.current.btcConnected).toBe(true);
    expect(result.current.sessionConfirmed).toBe(false);
    expect(result.current.connected).toBe(false);
    expect(result.current.requireBtcWallet()).toBe(false);
    expect(wallet.state.open).toHaveBeenCalledWith(undefined);
  });

  it("reports a locked Bitcoin wallet as not connected", () => {
    wallet.state.locked = true;
    const { result } = renderHook(() => useBtcAction());
    expect(result.current.btcConnected).toBe(true);
    expect(result.current.locked).toBe(true);
    expect(result.current.connected).toBe(false);
  });

  it("prompts the wallet unlock instead of the dialog when the Bitcoin wallet is locked", async () => {
    wallet.state.locked = true;
    const { result } = renderHook(() => useBtcAction());
    let passed: boolean | undefined;
    await act(async () => {
      passed = result.current.requireBtcWallet();
    });
    expect(passed).toBe(false);
    expect(wallet.state.reconnect).toHaveBeenCalledOnce();
    expect(wallet.state.open).not.toHaveBeenCalled();
  });

  it("reports the wallet as still loading while a saved session restores", () => {
    wallet.state.connected = false;
    wallet.state.loading = true;
    const { result } = renderHook(() => useBtcAction());
    expect(result.current.loading).toBe(true);
    expect(result.current.connected).toBe(false);
  });
});
