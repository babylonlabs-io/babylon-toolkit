import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  watchAccount: vi.fn<
    (config: Config, options: { onChange: (account: { address?: `0x${string}`; chainId?: number }) => void }) => () => void
  >(() => () => {}),
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
    ["AUTH", true, "chain", false],
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
      wagmiActions.getAccount.mockReturnValueOnce({ address: "0x00000000000000000000000000000000000000aB", chainId: 1, status: "connected" });
      await provider.connectWallet();

      if (refused) {
        await expect(provider.disconnect(scope)).rejects.toMatchObject({
          code: ERROR_CODES.SHARED_SESSION_DISCONNECT_REFUSED,
          chainId: "ETH",
        });
        expect(wagmiActions.disconnect).not.toHaveBeenCalled();
        await expect(provider.getAddress()).resolves.toBe("0x00000000000000000000000000000000000000aB");
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

    wagmiActions.getAccount.mockReturnValueOnce({ address: "0x00000000000000000000000000000000000000aB", chainId: 1, status: "connected" });
    await provider.connectWallet();

    wagmiActions.disconnect.mockRejectedValueOnce(new Error("disconnect failed"));

    await expect(provider.disconnect("chain")).rejects.toThrow("disconnect failed");
    await expect(provider.getAddress()).resolves.toBe("0x00000000000000000000000000000000000000aB");

    provider.destroy();
  });

  it("disconnect() clears the cached address when wagmiDisconnect resolves", async () => {
    vi.resetModules();
    const { setSharedWagmiConfig } = await import("../sharedConfig");
    const { AppKitProvider } = await import("../provider");

    setSharedWagmiConfig({} as Config);
    const provider = new AppKitProvider(ethConfig);

    wagmiActions.getAccount.mockReturnValueOnce({ address: "0x00000000000000000000000000000000000000aB", chainId: 1, status: "connected" });
    await provider.connectWallet();

    wagmiActions.disconnect.mockResolvedValueOnce(undefined);

    await provider.disconnect("chain");
    await expect(provider.getAddress()).rejects.toThrow("Wallet not connected");

    provider.destroy();
  });
});

describe("AppKitProvider — a momentarily empty account reading", () => {
  const ADDRESS = "0xAbC0000000000000000000000000000000000001";
  const OTHER_ADDRESS = "0xDef0000000000000000000000000000000000002";

  const connectedProvider = async () => {
    vi.resetModules();
    const { setSharedWagmiConfig } = await import("../sharedConfig");
    const { AppKitProvider } = await import("../provider");
    setSharedWagmiConfig({} as Config);
    const provider = new AppKitProvider(ethConfig);
    const { onChange } = wagmiActions.watchAccount.mock.calls[0][1];
    onChange({ address: ADDRESS, chainId: 1 });
    const accountsChanged = vi.fn();
    provider.on("accountsChanged", accountsChanged);
    return { provider, onChange, accountsChanged };
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("keeps the session when the same address returns within 3 s", async () => {
    const { provider, onChange, accountsChanged } = await connectedProvider();

    onChange({ address: undefined, chainId: undefined });
    vi.advanceTimersByTime(2_000);
    await expect(provider.getAddress()).resolves.toBe(ADDRESS);
    onChange({ address: ADDRESS.toLowerCase() as `0x${string}`, chainId: 1 });
    vi.advanceTimersByTime(5_000);

    expect(accountsChanged).not.toHaveBeenCalled();
    await expect(provider.getAddress()).resolves.toBe(ADDRESS.toLowerCase());
    provider.destroy();
  });

  it("reports the account as gone once, after it stays empty past 3 s", async () => {
    const { provider, onChange, accountsChanged } = await connectedProvider();

    onChange({ address: undefined, chainId: undefined });
    onChange({ address: undefined, chainId: undefined });
    vi.advanceTimersByTime(2_999);
    expect(accountsChanged).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(accountsChanged).toHaveBeenCalledTimes(1);
    expect(accountsChanged).toHaveBeenCalledWith([]);
    await expect(provider.getAddress()).rejects.toThrow("Wallet not connected");
    provider.destroy();
  });

  it("reports a different address at once, without waiting for the window", async () => {
    const { provider, onChange, accountsChanged } = await connectedProvider();

    onChange({ address: undefined, chainId: undefined });
    onChange({ address: OTHER_ADDRESS, chainId: 1 });

    expect(accountsChanged).toHaveBeenCalledTimes(1);
    expect(accountsChanged).toHaveBeenCalledWith([OTHER_ADDRESS]);
    vi.advanceTimersByTime(5_000);
    expect(accountsChanged).toHaveBeenCalledTimes(1);
    provider.destroy();
  });
});

describe("AppKitProvider — the AppKit modal closes while a connection is pending", () => {
  const ADDRESS = "0xAbC0000000000000000000000000000000000001";

  const setVisibility = (state: DocumentVisibilityState) => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue(state);
    document.dispatchEvent(new Event("visibilitychange"));
  };

  const startConnect = async () => {
    vi.resetModules();
    const { getAppKitModal } = await import("@/core/wallets/appkit/state");
    const { setSharedWagmiConfig } = await import("../sharedConfig");
    const { AppKitProvider } = await import("../provider");
    let onModalState: (state: { open: boolean }) => void = () => {};
    vi.mocked(getAppKitModal).mockReturnValue({
      subscribeState: (listener: (state: { open: boolean }) => void) => {
        onModalState = listener;
        return () => {};
      },
    } as never);
    setSharedWagmiConfig({} as Config);
    const provider = new AppKitProvider(ethConfig);

    let outcome = "pending";
    const connecting = provider.connectWallet().then(
      () => {
        outcome = "resolved";
      },
      (error: Error) => {
        outcome = error.message;
      },
    );
    const { onChange: approve } = wagmiActions.watchAccount.mock.calls[1][1];
    return { provider, onModalState, approve, connecting, outcome: () => outcome };
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("keeps the connection pending while the page is hidden, then resolves on approval", async () => {
    const { provider, onModalState, approve, connecting, outcome } = await startConnect();

    onModalState({ open: true });
    setVisibility("hidden");
    onModalState({ open: false });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(outcome()).toBe("pending");

    setVisibility("visible");
    approve({ address: ADDRESS, chainId: 1 });
    await connecting;
    expect(outcome()).toBe("resolved");
    await expect(provider.getAddress()).resolves.toBe(ADDRESS);
    provider.destroy();
  });

  it("cancels the connection 1.5 s after the modal closes while the page is visible", async () => {
    const { provider, onModalState, outcome } = await startConnect();

    onModalState({ open: true });
    onModalState({ open: false });
    await vi.advanceTimersByTimeAsync(1_499);
    expect(outcome()).toBe("pending");

    await vi.advanceTimersByTimeAsync(1);
    expect(outcome()).toBe("Failed to connect wallet: Connection cancelled");
    provider.destroy();
  });
});
