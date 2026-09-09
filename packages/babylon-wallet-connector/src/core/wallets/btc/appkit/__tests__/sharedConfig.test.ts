import { afterEach, describe, expect, it, vi } from "vitest";

import { ethDisconnectWouldDropBitcoin } from "@/core/wallets/eth/appkit/sharedConfig";

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

describe.each([
  ["Bitcoin", "bip122", "eip155", btcDisconnectWouldDropEthereum],
  ["Ethereum", "eip155", "bip122", ethDisconnectWouldDropBitcoin],
] as const)("%s shared disconnect", (_chain, namespace, otherNamespace, wouldDropOther) => {
  it("refuses WalletConnect while the other chain is connected", () => {
    const modal = setModal({
      providerTypes: { [namespace]: "WALLET_CONNECT", [otherNamespace]: "ANNOUNCED" },
      accounts: { [namespace]: { isConnected: false }, [otherNamespace]: { isConnected: true } },
    });

    expect(wouldDropOther()).toBe(true);
    expect(modal.getProviderType).toHaveBeenCalledWith(namespace);
    expect(modal.getAccount).toHaveBeenCalledWith(otherNamespace);
  });

  it("refuses Auth while the other chain is connected", () => {
    setModal({
      providerTypes: { [namespace]: "AUTH", [otherNamespace]: "ANNOUNCED" },
      accounts: { [namespace]: { isConnected: false }, [otherNamespace]: { isConnected: true } },
    });

    expect(wouldDropOther()).toBe(true);
  });

  it("allows an announced extension while the other chain uses WalletConnect", () => {
    setModal({
      providerTypes: { [namespace]: "ANNOUNCED", [otherNamespace]: "WALLET_CONNECT" },
      accounts: { bip122: { isConnected: true }, eip155: { isConnected: true } },
    });

    expect(wouldDropOther()).toBe(false);
  });

  it("allows WalletConnect when the other account is absent", () => {
    setModal({
      providerTypes: { [namespace]: "WALLET_CONNECT" },
      accounts: { [namespace]: { isConnected: true } },
    });

    expect(wouldDropOther()).toBe(false);
  });

  it("allows WalletConnect when the other account is disconnected", () => {
    setModal({
      providerTypes: { bip122: "WALLET_CONNECT", eip155: "WALLET_CONNECT" },
      accounts: { [namespace]: { isConnected: true }, [otherNamespace]: { isConnected: false } },
    });

    expect(wouldDropOther()).toBe(false);
  });

  it("reports no shared session before initialization", () => {
    expect(wouldDropOther()).toBe(false);
  });
});
