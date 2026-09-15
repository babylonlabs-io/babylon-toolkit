import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useBtcAction } from "../useBtcAction";

const wallet = vi.hoisted(() => ({
  btcConnected: true,
  confirmed: true,
  loading: false,
  open: vi.fn(),
}));

vi.mock("@babylonlabs-io/wallet-connector", () => ({
  useBTCWallet: () => ({
    connected: wallet.btcConnected,
    loading: wallet.loading,
  }),
  useWalletConnect: () => ({ connected: wallet.confirmed, open: wallet.open }),
}));

describe("useBtcAction", () => {
  beforeEach(() => {
    wallet.btcConnected = true;
    wallet.confirmed = true;
    wallet.loading = false;
    wallet.open.mockClear();
  });

  it("passes without opening the dialog when Bitcoin is connected and the session is confirmed", () => {
    const { result } = renderHook(() => useBtcAction());
    expect(result.current.connected).toBe(true);
    expect(result.current.requireBtcWallet()).toBe(true);
    expect(wallet.open).not.toHaveBeenCalled();
  });

  it("opens the Bitcoin wallet list when no Bitcoin wallet is connected", () => {
    wallet.btcConnected = false;
    const { result } = renderHook(() => useBtcAction());
    expect(result.current.btcConnected).toBe(false);
    expect(result.current.requireBtcWallet()).toBe(false);
    expect(wallet.open).toHaveBeenCalledWith("BTC");
  });

  it("opens the confirm step when Bitcoin is connected but the session is unconfirmed", () => {
    wallet.confirmed = false;
    const { result } = renderHook(() => useBtcAction());
    expect(result.current.btcConnected).toBe(true);
    expect(result.current.sessionConfirmed).toBe(false);
    expect(result.current.connected).toBe(false);
    expect(result.current.requireBtcWallet()).toBe(false);
    expect(wallet.open).toHaveBeenCalledWith(undefined);
  });

  it("reports the wallet as still loading while a saved session restores", () => {
    wallet.btcConnected = false;
    wallet.loading = true;
    const { result } = renderHook(() => useBtcAction());
    expect(result.current.loading).toBe(true);
    expect(result.current.connected).toBe(false);
  });
});
