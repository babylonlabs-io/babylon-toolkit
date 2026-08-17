import type { Config } from "wagmi";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ETHConfig } from "@/core/types";

// The provider is constructed eagerly by `createWallet` (metadata has
// `wallet: undefined`), so its constructor must tolerate AppKit init not
// having run yet. The wagmi actions are mocked so the tests can observe
// whether the constructor attached the account/chain watchers; the AppKit
// modal module is mocked to keep the heavy `@reown/appkit` graph out of the
// unit-test environment.
const wagmiActions = vi.hoisted(() => ({
  getAccount: vi.fn(() => ({
    address: undefined,
    chainId: undefined,
    status: "disconnected" as const,
  })),
  watchAccount: vi.fn(() => () => {}),
  watchChainId: vi.fn(() => () => {}),
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
  disconnect: vi.fn(),
}));

vi.mock("wagmi/connectors", () => ({
  walletConnect: vi.fn(),
}));

vi.mock("@/core/wallets/appkit/state", () => ({
  getAppKitModal: vi.fn(() => null),
}));

const ethConfig: ETHConfig = {
  chainId: 11155111,
  chainName: "Sepolia",
  rpcUrl: "https://rpc.example.com",
  explorerUrl: "https://explorer.example.com",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
};

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
});
