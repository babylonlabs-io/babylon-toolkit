import { afterEach, describe, expect, it, vi } from "vitest";

import type { BTCConfig } from "@/core/types";
import { Network } from "@/core/types";
import { ERROR_CODES, WalletError } from "@/error";

import { APPKIT_BTC_CONNECTED_EVENT } from "../constants";
import { AppKitBTCProvider } from "../provider";
import { __resetSharedBtcAppKitConfigForTests, setSharedBtcAppKitConfig } from "../sharedConfig";

afterEach(() => {
  __resetSharedBtcAppKitConfigForTests();
});

async function connect(provider: AppKitBTCProvider, connectionEvents: EventTarget, address: string) {
  const connection = provider.connectWallet();
  connectionEvents.dispatchEvent(
    new CustomEvent(APPKIT_BTC_CONNECTED_EVENT, {
      detail: { address, publicKey: `02${"a".repeat(64)}` },
    }),
  );
  await connection;
}

describe("AppKitBTCProvider disconnect", () => {
  it("disconnects only the bitcoin namespace for an announced extension while ethereum stays connected", async () => {
    const connectionEvents = new EventTarget();
    const unsubscribeNetwork = vi.fn();
    const modal = {
      disconnect: vi.fn().mockResolvedValue(undefined),
      getProviderType: vi.fn(() => "ANNOUNCED"),
      getAccount: vi.fn(() => ({ isConnected: true })),
      subscribeNetwork: vi.fn(() => unsubscribeNetwork),
    };
    setSharedBtcAppKitConfig({
      modal: modal as never,
      adapter: {} as never,
      network: "signet",
      connectionEvents,
    });
    const provider = new AppKitBTCProvider({ network: Network.SIGNET } as BTCConfig);
    await connect(provider, connectionEvents, "bc1pdepositor");

    await provider.disconnect("chain");

    expect(modal.disconnect).toHaveBeenCalledTimes(1);
    expect(modal.disconnect).toHaveBeenCalledWith("bip122");
    await expect(provider.getAddress()).rejects.toThrow("Bitcoin wallet not connected");
    expect(unsubscribeNetwork).toHaveBeenCalledTimes(1);
  });

  it("refuses a bitcoin-only disconnect when a walletconnect session also carries ethereum", async () => {
    const connectionEvents = new EventTarget();
    const modal = {
      disconnect: vi.fn().mockResolvedValue(undefined),
      getProviderType: vi.fn(() => "WALLET_CONNECT"),
      getAccount: vi.fn(() => ({ isConnected: true })),
      subscribeNetwork: vi.fn(() => vi.fn()),
    };
    setSharedBtcAppKitConfig({
      modal: modal as never,
      adapter: {} as never,
      network: "signet",
      connectionEvents,
    });
    const provider = new AppKitBTCProvider({ network: Network.SIGNET } as BTCConfig);
    await connect(provider, connectionEvents, "bc1pdepositor");

    const error = await provider.disconnect("chain").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(WalletError);
    expect((error as WalletError).code).toBe(ERROR_CODES.SHARED_SESSION_DISCONNECT_REFUSED);
    expect((error as WalletError).chainId).toBe("BTC");
    expect(modal.disconnect).not.toHaveBeenCalled();
    await expect(provider.getAddress()).resolves.toBe("bc1pdepositor");

    const onAccountsChanged = vi.fn();
    provider.on("accountsChanged", onAccountsChanged);
    connectionEvents.dispatchEvent(
      new CustomEvent(APPKIT_BTC_CONNECTED_EVENT, {
        detail: { address: "bc1pother", publicKey: `02${"b".repeat(64)}` },
      }),
    );

    expect(onAccountsChanged).toHaveBeenCalledWith(["bc1pother"]);
  });

  it("refuses when the bitcoin connector is auth and ethereum is connected", async () => {
    const connectionEvents = new EventTarget();
    const modal = {
      disconnect: vi.fn().mockResolvedValue(undefined),
      getProviderType: vi.fn(() => "AUTH"),
      getAccount: vi.fn(() => ({ isConnected: true })),
      subscribeNetwork: vi.fn(() => vi.fn()),
    };
    setSharedBtcAppKitConfig({
      modal: modal as never,
      adapter: {} as never,
      network: "signet",
      connectionEvents,
    });
    const provider = new AppKitBTCProvider({ network: Network.SIGNET } as BTCConfig);
    await connect(provider, connectionEvents, "bc1pdepositor");

    const error = await provider.disconnect("chain").catch((e: unknown) => e);

    expect((error as WalletError).code).toBe(ERROR_CODES.SHARED_SESSION_DISCONNECT_REFUSED);
    expect(modal.disconnect).not.toHaveBeenCalled();
  });

  it("disconnects bitcoin over walletconnect when ethereum is not connected", async () => {
    const connectionEvents = new EventTarget();
    const modal = {
      disconnect: vi.fn().mockResolvedValue(undefined),
      getProviderType: vi.fn(() => "WALLET_CONNECT"),
      getAccount: vi.fn(() => undefined),
      subscribeNetwork: vi.fn(() => vi.fn()),
    };
    setSharedBtcAppKitConfig({
      modal: modal as never,
      adapter: {} as never,
      network: "signet",
      connectionEvents,
    });
    const provider = new AppKitBTCProvider({ network: Network.SIGNET } as BTCConfig);
    await connect(provider, connectionEvents, "bc1pdepositor");

    await provider.disconnect("chain");

    expect(modal.disconnect).toHaveBeenCalledTimes(1);
    expect(modal.disconnect).toHaveBeenCalledWith("bip122");
  });

  it("disconnects bitcoin over walletconnect when the ethereum account exists but is not connected", async () => {
    const connectionEvents = new EventTarget();
    const modal = {
      disconnect: vi.fn().mockResolvedValue(undefined),
      getProviderType: vi.fn(() => "WALLET_CONNECT"),
      getAccount: vi.fn(() => ({ isConnected: false })),
      subscribeNetwork: vi.fn(() => vi.fn()),
    };
    setSharedBtcAppKitConfig({
      modal: modal as never,
      adapter: {} as never,
      network: "signet",
      connectionEvents,
    });
    const provider = new AppKitBTCProvider({ network: Network.SIGNET } as BTCConfig);
    await connect(provider, connectionEvents, "bc1pdepositor");

    await provider.disconnect("chain");

    expect(modal.disconnect).toHaveBeenCalledTimes(1);
    expect(modal.disconnect).toHaveBeenCalledWith("bip122");
  });

  it("disconnects an announced bitcoin extension even when ethereum uses walletconnect", async () => {
    const connectionEvents = new EventTarget();
    const modal = {
      disconnect: vi.fn().mockResolvedValue(undefined),
      getProviderType: vi.fn((namespace: string) => (namespace === "bip122" ? "ANNOUNCED" : "WALLET_CONNECT")),
      getAccount: vi.fn(() => ({ isConnected: true })),
      subscribeNetwork: vi.fn(() => vi.fn()),
    };
    setSharedBtcAppKitConfig({
      modal: modal as never,
      adapter: {} as never,
      network: "signet",
      connectionEvents,
    });
    const provider = new AppKitBTCProvider({ network: Network.SIGNET } as BTCConfig);
    await connect(provider, connectionEvents, "bc1pdepositor");

    await provider.disconnect("chain");

    expect(modal.getProviderType).toHaveBeenCalledWith("bip122");
    expect(modal.disconnect).toHaveBeenCalledWith("bip122");
  });

  it("clears only local state on a local disconnect and never calls appkit", async () => {
    const connectionEvents = new EventTarget();
    const unsubscribeNetwork = vi.fn();
    const modal = {
      disconnect: vi.fn().mockResolvedValue(undefined),
      getProviderType: vi.fn(() => "WALLET_CONNECT"),
      getAccount: vi.fn(() => ({ isConnected: true })),
      subscribeNetwork: vi.fn(() => unsubscribeNetwork),
    };
    setSharedBtcAppKitConfig({
      modal: modal as never,
      adapter: {} as never,
      network: "signet",
      connectionEvents,
    });
    const provider = new AppKitBTCProvider({ network: Network.SIGNET } as BTCConfig);
    await connect(provider, connectionEvents, "bc1pdepositor");

    await provider.disconnect("local");

    expect(modal.disconnect).not.toHaveBeenCalled();
    expect(modal.getProviderType).not.toHaveBeenCalled();
    expect(unsubscribeNetwork).toHaveBeenCalledTimes(1);
    await expect(provider.getAddress()).rejects.toThrow("Bitcoin wallet not connected");
  });

  it("completes a local disconnect before appkit is initialized", async () => {
    const provider = new AppKitBTCProvider({ network: Network.SIGNET } as BTCConfig);

    await expect(provider.disconnect("local")).resolves.toBeUndefined();
  });

  it("disconnects every chain on an explicit disconnect-all even over a shared walletconnect session", async () => {
    const connectionEvents = new EventTarget();
    const modal = {
      disconnect: vi.fn().mockResolvedValue(undefined),
      getProviderType: vi.fn(() => "WALLET_CONNECT"),
      getAccount: vi.fn(() => ({ isConnected: true })),
      subscribeNetwork: vi.fn(() => vi.fn()),
    };
    setSharedBtcAppKitConfig({
      modal: modal as never,
      adapter: {} as never,
      network: "signet",
      connectionEvents,
    });
    const provider = new AppKitBTCProvider({ network: Network.SIGNET } as BTCConfig);
    await connect(provider, connectionEvents, "bc1pdepositor");

    await provider.disconnect("all");

    expect(modal.disconnect).toHaveBeenCalledTimes(1);
    expect(modal.disconnect).toHaveBeenCalledWith();
    expect(modal.disconnect.mock.calls[0]).toEqual([]);
    expect(modal.getProviderType).not.toHaveBeenCalled();
    expect(modal.getAccount).not.toHaveBeenCalled();
    await expect(provider.getAddress()).rejects.toThrow("Bitcoin wallet not connected");
  });

  it("clears local state when an explicit disconnect-all fails part way", async () => {
    const connectionEvents = new EventTarget();
    const unsubscribeNetwork = vi.fn();
    const modal = {
      disconnect: vi.fn().mockRejectedValue(new Error("Failed to disconnect chains: boom")),
      getProviderType: vi.fn(() => "WALLET_CONNECT"),
      getAccount: vi.fn(() => ({ isConnected: true })),
      subscribeNetwork: vi.fn(() => unsubscribeNetwork),
    };
    setSharedBtcAppKitConfig({
      modal: modal as never,
      adapter: {} as never,
      network: "signet",
      connectionEvents,
    });
    const provider = new AppKitBTCProvider({ network: Network.SIGNET } as BTCConfig);
    await connect(provider, connectionEvents, "bc1pdepositor");

    await expect(provider.disconnect("all")).rejects.toThrow("boom");

    await expect(provider.getAddress()).rejects.toThrow("Bitcoin wallet not connected");
    expect(unsubscribeNetwork).toHaveBeenCalledTimes(1);
  });

  it("keeps local state when appkit fails to disconnect bitcoin", async () => {
    const connectionEvents = new EventTarget();
    const unsubscribeNetwork = vi.fn();
    const modal = {
      disconnect: vi.fn().mockRejectedValue(new Error("boom")),
      getProviderType: vi.fn(() => "ANNOUNCED"),
      getAccount: vi.fn(() => undefined),
      subscribeNetwork: vi.fn(() => unsubscribeNetwork),
    };
    setSharedBtcAppKitConfig({
      modal: modal as never,
      adapter: {} as never,
      network: "signet",
      connectionEvents,
    });
    const provider = new AppKitBTCProvider({ network: Network.SIGNET } as BTCConfig);
    await connect(provider, connectionEvents, "bc1pdepositor");

    await expect(provider.disconnect("chain")).rejects.toThrow("boom");

    await expect(provider.getAddress()).resolves.toBe("bc1pdepositor");
    expect(unsubscribeNetwork).not.toHaveBeenCalled();
  });
});
