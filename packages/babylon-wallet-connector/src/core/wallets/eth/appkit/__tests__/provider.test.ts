import { afterEach, describe, expect, it, vi } from "vitest";
import type { Config } from "wagmi";

import type { ETHConfig } from "@/core/types";
import { ERROR_CODES } from "@/error";

// `createWallet` constructs the provider before AppKit initialization.
// The mocks show whether the constructor attached the watchers.
// They also keep the heavy `@reown/appkit` graph out of this test.
const wagmiActions = vi.hoisted(() => ({
  getAccount: vi.fn((): { address?: `0x${string}`; chainId?: number; status: "connected" | "disconnected" } => ({
    address: undefined,
    chainId: undefined,
    status: "disconnected",
  })),
  watchAccount: vi.fn(() => () => {}),
  watchChainId: vi.fn(() => () => {}),
  disconnect: vi.fn(),
}));

vi.mock("wagmi/actions", () => ({
  getAccount: wagmiActions.getAccount,
  getTransactionCount: vi.fn(),
  estimateGas: vi.fn(),
  getBalance: vi.fn(),
  sendTransaction: vi.fn(),
  signMessage: vi.fn(),
  signTypedData: vi.fn(),
  switchChain: vi.fn(),
  watchAccount: wagmiActions.watchAccount,
  watchChainId: wagmiActions.watchChainId,
  connect: vi.fn(),
  disconnect: wagmiActions.disconnect,
}));

vi.mock("wagmi/connectors", () => ({
  walletConnect: vi.fn(),
}));

vi.mock("@/core/wallets/appkit/state", () => ({
  getAppKitState: vi.fn(() => null),
  getAppKitModal: vi.fn(() => null),
  // This provider test bypasses mode exclusivity. Initialization tests cover this guard.
  registerManualAppKitConfig: vi.fn(),
}));

const ethConfig: ETHConfig = {
  chainId: 11155111,
  chainName: "Sepolia",
  rpcUrl: "https://rpc.example.com",
  explorerUrl: "https://explorer.example.com",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
};

afterEach(async () => {
  const { getAppKitModal } = await import("@/core/wallets/appkit/state");
  vi.mocked(getAppKitModal).mockReturnValue(null);
});

// The shared-config singleton has no reset hook, so each test resets the
// module registry and imports a fresh provider + sharedConfig pair. The
// mocked wagmi functions above survive the reset (`vi.hoisted`), so call
// counts remain observable.
describe("AppKitProvider — constructed before AppKit init (no shared wagmi config)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("constructs without throwing and does not start event watchers", async () => {
    vi.resetModules();
    const { AppKitProvider } = await import("../provider");

    expect(() => new AppKitProvider(ethConfig)).not.toThrow();

    expect(wagmiActions.getAccount).not.toHaveBeenCalled();
    expect(wagmiActions.watchAccount).not.toHaveBeenCalled();
    expect(wagmiActions.watchChainId).not.toHaveBeenCalled();
  });

  it("connectWallet rejects with the AppKit ETH not-initialized error", async () => {
    vi.resetModules();
    const { AppKitProvider } = await import("../provider");
    const provider = new AppKitProvider(ethConfig);

    // connectWallet logs the failure before rethrowing; keep the suite
    // output clean without asserting on the log itself.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(provider.connectWallet()).rejects.toThrow("AppKit ETH not initialized");
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe("AppKitProvider — constructed after AppKit init (shared wagmi config set)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["ANNOUNCED", true, "chain", false],
    ["WALLET_CONNECT", true, "chain", true],
    ["AUTH", true, "chain", true],
    ["WALLET_CONNECT", false, "chain", false],
    ["WALLET_CONNECT", undefined, "chain", false],
    ["WALLET_CONNECT", true, "all", false],
    ["AUTH", true, "all", false],
    ["WALLET_CONNECT", true, "local", false],
  ] as const)(
    "handles %s with Bitcoin connected=%s for scope=%s",
    async (providerType, btcConnected, scope, refused) => {
      vi.resetModules();
      const { getAppKitModal } = await import("@/core/wallets/appkit/state");
      const { setSharedWagmiConfig } = await import("../sharedConfig");
      const { AppKitProvider } = await import("../provider");
      vi.mocked(getAppKitModal).mockReturnValue({
        getProviderType: (namespace: string) => (namespace === "eip155" ? providerType : "ANNOUNCED"),
        getAccount: (namespace: string) =>
          namespace === "bip122" && btcConnected !== undefined ? { isConnected: btcConnected } : undefined,
      } as never);
      const sharedConfig = {} as Config;
      setSharedWagmiConfig(sharedConfig);
      const provider = new AppKitProvider(ethConfig);
      wagmiActions.getAccount.mockReturnValueOnce({ address: "0xabc", chainId: 1, status: "connected" });
      await provider.connectWallet();

      if (refused) {
        await expect(provider.disconnect(scope)).rejects.toMatchObject({
          code: ERROR_CODES.SHARED_SESSION_DISCONNECT_REFUSED,
          chainId: "ETH",
        });
        expect(wagmiActions.disconnect).not.toHaveBeenCalled();
        await expect(provider.getAddress()).resolves.toBe("0xabc");
        await expect(provider.getChainId()).resolves.toBe(1);
      } else {
        await provider.disconnect(scope);
        if (scope === "local") expect(wagmiActions.disconnect).not.toHaveBeenCalled();
        else expect(wagmiActions.disconnect).toHaveBeenCalledWith(sharedConfig);
        await expect(provider.getAddress()).rejects.toThrow("Wallet not connected");
        await expect(provider.getChainId()).rejects.toThrow("Wallet not connected");
      }
      provider.destroy();
    },
  );

  it("starts the account and chain watchers against the shared config on construction", async () => {
    vi.resetModules();
    const { setSharedWagmiConfig } = await import("../sharedConfig");
    const { AppKitProvider } = await import("../provider");

    const sharedConfig = {} as Config;
    setSharedWagmiConfig(sharedConfig);

    const provider = new AppKitProvider(ethConfig);

    expect(wagmiActions.watchAccount).toHaveBeenCalledTimes(1);
    expect(wagmiActions.watchAccount).toHaveBeenCalledWith(
      sharedConfig,
      expect.objectContaining({ onChange: expect.any(Function) }),
    );
    expect(wagmiActions.watchChainId).toHaveBeenCalledTimes(1);
    expect(wagmiActions.watchChainId).toHaveBeenCalledWith(
      sharedConfig,
      expect.objectContaining({ onChange: expect.any(Function) }),
    );

    provider.destroy();
  });

  it("rejects when wagmi has no live chain", async () => {
    vi.resetModules();
    const { setSharedWagmiConfig } = await import("../sharedConfig");
    const { AppKitProvider } = await import("../provider");

    setSharedWagmiConfig({} as Config);
    const provider = new AppKitProvider(ethConfig);

    await expect(provider.getChainId()).rejects.toThrow("Wallet not connected");
    provider.destroy();
  });

  it("disconnect() rejects and keeps the cached address when wagmiDisconnect rejects", async () => {
    vi.resetModules();
    const { setSharedWagmiConfig } = await import("../sharedConfig");
    const { AppKitProvider } = await import("../provider");

    setSharedWagmiConfig({} as Config);
    const provider = new AppKitProvider(ethConfig);

    wagmiActions.getAccount.mockReturnValueOnce({ address: "0xabc", chainId: 1, status: "connected" });
    await provider.connectWallet();

    wagmiActions.disconnect.mockRejectedValueOnce(new Error("disconnect failed"));

    await expect(provider.disconnect("chain")).rejects.toThrow("disconnect failed");
    await expect(provider.getAddress()).resolves.toBe("0xabc");

    provider.destroy();
  });

  it("disconnect() clears the cached address when wagmiDisconnect resolves", async () => {
    vi.resetModules();
    const { setSharedWagmiConfig } = await import("../sharedConfig");
    const { AppKitProvider } = await import("../provider");

    setSharedWagmiConfig({} as Config);
    const provider = new AppKitProvider(ethConfig);

    wagmiActions.getAccount.mockReturnValueOnce({ address: "0xabc", chainId: 1, status: "connected" });
    await provider.connectWallet();

    wagmiActions.disconnect.mockResolvedValueOnce(undefined);

    await provider.disconnect("chain");
    await expect(provider.getAddress()).rejects.toThrow("Wallet not connected");

    provider.destroy();
  });
});
