import { describe, expect, it, vi } from "vitest";

import type { IBTCProvider } from "@/core/types";

import { UtilaProvider } from "../provider";

describe("UtilaProvider identity cache", () => {
  it("marks cached identity stale until a successful refresh", async () => {
    const handlers = new Map<string, () => void>();
    let address = "bc1pold";
    let publicKeyHex = `02${"a".repeat(64)}`;
    const wallet = {
      connectWallet: vi.fn(async () => {}),
      getAddress: vi.fn(async () => address),
      getPublicKeyHex: vi.fn(async () => publicKeyHex),
      on: vi.fn((event: string, callback: () => void) => handlers.set(event, callback)),
    } as unknown as IBTCProvider;
    const provider = new UtilaProvider({ bitcoin: wallet });

    await provider.connectWallet();
    expect(provider.isIdentityCurrent()).toBe(true);

    handlers.get("accountsChanged")?.();
    expect(provider.isIdentityCurrent()).toBe(false);
    expect(await provider.getAddress()).toBe("bc1pold");

    address = "bc1pnew";
    publicKeyHex = `02${"b".repeat(64)}`;
    await provider.connectWallet();
    expect(provider.isIdentityCurrent()).toBe(true);
    expect(await provider.getAddress()).toBe("bc1pnew");

    handlers.get("networkChanged")?.();
    expect(provider.isIdentityCurrent()).toBe(false);

    await provider.connectWallet();
    handlers.get("disconnect")?.();
    expect(provider.isIdentityCurrent()).toBe(false);
  });

  it("does not mark an identity read current after an event interrupts it", async () => {
    const handlers = new Map<string, () => void>();
    let resolveAddress!: (address: string) => void;
    let markAddressStarted!: () => void;
    const address = new Promise<string>((resolve) => {
      resolveAddress = resolve;
    });
    const addressStarted = new Promise<void>((resolve) => {
      markAddressStarted = resolve;
    });
    const wallet = {
      connectWallet: vi.fn(async () => {}),
      getAddress: vi.fn(() => {
        markAddressStarted();
        return address;
      }),
      getPublicKeyHex: vi.fn(async () => `02${"a".repeat(64)}`),
      on: vi.fn((event: string, callback: () => void) => handlers.set(event, callback)),
    } as unknown as IBTCProvider;
    const provider = new UtilaProvider({ bitcoin: wallet });

    const connecting = provider.connectWallet();
    await addressStarted;
    handlers.get("accountsChanged")?.();
    resolveAddress("bc1pstale");
    await connecting;

    expect(provider.isIdentityCurrent()).toBe(false);
  });

  it("allows optional identity events to be unsupported", async () => {
    let onAccountsChanged = () => {};
    const wallet = {
      connectWallet: vi.fn(async () => {}),
      getAddress: vi.fn(async () => "bc1pcurrent"),
      getPublicKeyHex: vi.fn(async () => `02${"a".repeat(64)}`),
      on: vi.fn((event: string, callback: () => void) => {
        if (event !== "accountsChanged") throw new Error("Unsupported event");
        onAccountsChanged = callback;
      }),
    } as unknown as IBTCProvider;
    const provider = new UtilaProvider({ bitcoin: wallet });

    await provider.connectWallet();
    expect(provider.isIdentityCurrent()).toBe(true);

    onAccountsChanged();
    expect(provider.isIdentityCurrent()).toBe(false);
  });

  it("retries required event tracking and keeps supported optional events", async () => {
    let accountAttempts = 0;
    let onNetworkChanged = () => {};
    const wallet = {
      connectWallet: vi.fn(async () => {}),
      getAddress: vi.fn(async () => "bc1pcurrent"),
      getPublicKeyHex: vi.fn(async () => `02${"a".repeat(64)}`),
      on: vi.fn((event: string, callback: () => void) => {
        if (event === "accountsChanged") {
          accountAttempts += 1;
          if (accountAttempts === 1) throw new Error("Temporary error");
        }
        if (event === "networkChanged") onNetworkChanged = callback;
        if (event === "disconnect") throw new Error("Unsupported event");
      }),
    } as unknown as IBTCProvider;
    const provider = new UtilaProvider({ bitcoin: wallet });

    await provider.connectWallet();
    expect(provider.isIdentityCurrent()).toBe(false);

    await provider.connectWallet();
    expect(provider.isIdentityCurrent()).toBe(true);

    onNetworkChanged();
    expect(provider.isIdentityCurrent()).toBe(false);
  });
});
