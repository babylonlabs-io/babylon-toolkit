import { afterEach, describe, expect, it, vi } from "vitest";

import { __resetSharedBtcAppKitConfigForTests, btcDisconnectWouldDropEthereum, setSharedBtcAppKitConfig } from "../sharedConfig";

afterEach(() => {
  __resetSharedBtcAppKitConfigForTests();
});

function setModal(getProviderType: () => string, getAccount: () => { isConnected: boolean } | undefined) {
  setSharedBtcAppKitConfig({
    modal: { getProviderType: vi.fn(getProviderType), getAccount: vi.fn(getAccount) } as never,
    adapter: {} as never,
    network: "signet",
  });
}

describe("btcDisconnectWouldDropEthereum", () => {
  it("reports true when bitcoin runs over walletconnect and ethereum is connected", () => {
    setModal(
      () => "WALLET_CONNECT",
      () => ({ isConnected: true }),
    );

    expect(btcDisconnectWouldDropEthereum()).toBe(true);
  });

  it("reports true when bitcoin runs over auth and ethereum is connected", () => {
    setModal(
      () => "AUTH",
      () => ({ isConnected: true }),
    );

    expect(btcDisconnectWouldDropEthereum()).toBe(true);
  });

  it("reports false for an injected bitcoin wallet even while ethereum is connected", () => {
    setModal(
      () => "INJECTED",
      () => ({ isConnected: true }),
    );

    expect(btcDisconnectWouldDropEthereum()).toBe(false);
  });

  it("reports false over walletconnect when there is no ethereum account", () => {
    setModal(
      () => "WALLET_CONNECT",
      () => undefined,
    );

    expect(btcDisconnectWouldDropEthereum()).toBe(false);
  });

  it("reports false over walletconnect when the ethereum account is disconnected", () => {
    setModal(
      () => "WALLET_CONNECT",
      () => ({ isConnected: false }),
    );

    expect(btcDisconnectWouldDropEthereum()).toBe(false);
  });

  it("reports false when no shared bitcoin config is registered", () => {
    expect(btcDisconnectWouldDropEthereum()).toBe(false);
  });
});
