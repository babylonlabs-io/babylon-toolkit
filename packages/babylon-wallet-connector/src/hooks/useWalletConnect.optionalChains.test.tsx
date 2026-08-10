import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Context, type Connectors } from "@/context/Chain.context";
import { StateContext, type Actions, type State } from "@/context/State.context";
import type { IWallet } from "@/core/types";

import { useWalletConnect } from "./useWalletConnect";

const ethWallet = {
  id: "eth-wallet",
  account: { address: "0x123", publicKeyHex: "0x123" },
} as IWallet;

function renderWalletConnect({
  state,
  actions = {},
  connectors,
}: {
  state: Partial<State>;
  actions?: Actions;
  connectors?: Partial<Connectors>;
}) {
  const value = {
    confirmed: false,
    visible: false,
    screen: { type: "CHAINS" as const },
    selectedWallets: {},
    chains: {},
    requiredChainIds: [],
    ...state,
    ...actions,
  };

  return renderHook(() => useWalletConnect(), {
    wrapper: ({ children }) => (
      <Context.Provider value={{ BTC: null, BBN: null, ETH: null, ...connectors } as Connectors}>
        <StateContext.Provider value={value}>{children}</StateContext.Provider>
      </Context.Provider>
    ),
  });
}

describe("useWalletConnect optional chains", () => {
  it("treats a selected required ETH chain as connected while visible BTC is optional", () => {
    const { result } = renderWalletConnect({
      state: {
        confirmed: true,
        chains: {
          BTC: { id: "BTC" } as any,
          ETH: { id: "ETH" } as any,
        },
        requiredChainIds: ["ETH"],
        selectedWallets: { ETH: ethWallet },
      },
    });

    expect(result.current.selected).toBe(true);
    expect(result.current.connected).toBe(true);
  });

  it("preserves the confirmed session when opening a targeted optional chain", () => {
    const openModal = vi.fn();
    const displayWallets = vi.fn();
    const reset = vi.fn();
    const { result } = renderWalletConnect({
      state: {
        confirmed: true,
        chains: { BTC: { id: "BTC" } as any, ETH: { id: "ETH" } as any },
        requiredChainIds: ["ETH"],
        selectedWallets: { ETH: ethWallet },
      },
      actions: { open: openModal, displayWallets, reset },
    });

    act(() => result.current.open("BTC"));

    expect(displayWallets).toHaveBeenCalledWith("BTC");
    expect(openModal).toHaveBeenCalledOnce();
    expect(reset).not.toHaveBeenCalled();
    expect(result.current.connected).toBe(true);
  });

  it("disconnects one chain without resetting the confirmed required chain", async () => {
    const disconnectBTC = vi.fn(async () => {});
    const disconnectETH = vi.fn(async () => {});
    const reset = vi.fn();
    const { result } = renderWalletConnect({
      state: { requiredChainIds: ["ETH"], selectedWallets: { ETH: ethWallet } },
      actions: { reset },
      connectors: {
        BTC: { disconnect: disconnectBTC } as any,
        ETH: { disconnect: disconnectETH } as any,
        BBN: null,
      },
    });

    await act(() => result.current.disconnect("BTC"));

    expect(disconnectBTC).toHaveBeenCalledOnce();
    expect(disconnectETH).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
  });
});
