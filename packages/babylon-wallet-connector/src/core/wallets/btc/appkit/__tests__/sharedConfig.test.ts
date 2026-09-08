import { afterEach, describe, expect, it, vi } from "vitest";

import {
  __resetSharedBtcAppKitConfigForTests,
  btcDisconnectWouldDropEthereum,
  setSharedBtcAppKitConfig,
} from "../sharedConfig";

afterEach(() => {
  __resetSharedBtcAppKitConfigForTests();
});

type Namespace = "bip122" | "eip155";

// Both AppKit accessors are per-namespace lookups, so every fixture gives the
// two namespaces different values: a predicate that read the wrong one fails.
function setModal(session: {
  providerTypes: Partial<Record<Namespace, string>>;
  accounts: Partial<Record<Namespace, { isConnected: boolean }>>;
}) {
  const modal = {
    getProviderType: vi.fn((namespace: Namespace) => session.providerTypes[namespace]),
    getAccount: vi.fn((namespace: Namespace) => session.accounts[namespace]),
  };
  setSharedBtcAppKitConfig({ modal: modal as never, adapter: {} as never, network: "signet" });
  return modal;
}

describe("btcDisconnectWouldDropEthereum", () => {
  it("reports true when bitcoin runs over walletconnect and ethereum is connected", () => {
    const modal = setModal({
      providerTypes: { bip122: "WALLET_CONNECT", eip155: "ANNOUNCED" },
      accounts: { bip122: { isConnected: false }, eip155: { isConnected: true } },
    });

    expect(btcDisconnectWouldDropEthereum()).toBe(true);
    expect(modal.getProviderType).toHaveBeenCalledWith("bip122");
    expect(modal.getAccount).toHaveBeenCalledWith("eip155");
  });

  it("reports true when bitcoin runs over auth and ethereum is connected", () => {
    setModal({
      providerTypes: { bip122: "AUTH", eip155: "ANNOUNCED" },
      accounts: { bip122: { isConnected: false }, eip155: { isConnected: true } },
    });

    expect(btcDisconnectWouldDropEthereum()).toBe(true);
  });

  it("reports false for an announced bitcoin extension even while ethereum is connected over walletconnect", () => {
    setModal({
      providerTypes: { bip122: "ANNOUNCED", eip155: "WALLET_CONNECT" },
      accounts: { bip122: { isConnected: true }, eip155: { isConnected: true } },
    });

    expect(btcDisconnectWouldDropEthereum()).toBe(false);
  });

  it("reports false over walletconnect when there is no ethereum account", () => {
    setModal({
      providerTypes: { bip122: "WALLET_CONNECT" },
      accounts: { bip122: { isConnected: true } },
    });

    expect(btcDisconnectWouldDropEthereum()).toBe(false);
  });

  it("reports false over walletconnect when the ethereum account is disconnected", () => {
    setModal({
      providerTypes: { bip122: "WALLET_CONNECT", eip155: "WALLET_CONNECT" },
      accounts: { bip122: { isConnected: true }, eip155: { isConnected: false } },
    });

    expect(btcDisconnectWouldDropEthereum()).toBe(false);
  });

  it("reports false when no shared bitcoin config is registered", () => {
    expect(btcDisconnectWouldDropEthereum()).toBe(false);
  });
});
