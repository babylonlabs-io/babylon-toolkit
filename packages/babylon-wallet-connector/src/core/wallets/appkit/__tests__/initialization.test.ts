import type { Chain } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bitcoinError: null as Error | null,
  createAppKit: vi.fn(),
  wagmiError: null as Error | null,
  wagmiConfig: { id: "wagmi-config" },
}));

vi.mock("@reown/appkit/react", () => ({
  createAppKit: mocks.createAppKit,
}));

vi.mock("@reown/appkit-adapter-wagmi", () => ({
  WagmiAdapter: class {
    readonly wagmiConfig = mocks.wagmiConfig;

    constructor() {
      if (mocks.wagmiError) throw mocks.wagmiError;
    }
  },
}));

vi.mock("@reown/appkit-adapter-bitcoin", () => ({
  BitcoinAdapter: class {
    constructor() {
      if (mocks.bitcoinError) throw mocks.bitcoinError;
    }
  },
}));

vi.mock("@reown/appkit/networks", () => ({
  bitcoin: { id: "bitcoin" },
  bitcoinSignet: { id: "bitcoin-signet" },
}));

vi.mock("viem", () => ({
  http: vi.fn(() => ({})),
}));

vi.mock("wagmi", () => ({
  cookieStorage: {},
  createStorage: vi.fn(() => ({})),
}));

vi.mock("wagmi/connectors", () => ({
  baseAccount: vi.fn(() => ({})),
}));

const metadata = {
  name: "Test App",
  description: "Test AppKit",
  url: "https://example.com",
  icons: ["https://example.com/icon.png"],
};

const ethChain: Chain = {
  id: 11155111,
  name: "Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.example.com"] } },
};

const ethConfig = (chain: Chain = ethChain) => ({ projectId: "project", metadata, eth: { chain } });
const btcConfig = (network: "mainnet" | "signet" = "signet") => ({
  projectId: "project",
  metadata,
  btc: { network },
});
const combinedConfig = () => ({ ...ethConfig(), btc: { network: "signet" as const } });

describe("shared AppKit initialization", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.bitcoinError = null;
    mocks.wagmiError = null;
    mocks.createAppKit.mockReset();
    mocks.createAppKit.mockImplementation(() => ({ id: Symbol("appkit-modal") }));
  });

  it("rejects adding Bitcoin after Ethereum-only initialization", async () => {
    const eth = await import("../../eth/appkit/modal");
    const combined = await import("../appKitModal");

    eth.initializeAppKitModal(ethConfig());

    expect(() => combined.initializeAppKitModal(combinedConfig())).toThrow(
      "already initialized without Bitcoin support",
    );
    expect(mocks.createAppKit).toHaveBeenCalledTimes(1);
  });

  it("rejects adding Ethereum after Bitcoin-only initialization", async () => {
    const combined = await import("../appKitModal");
    const eth = await import("../../eth/appkit/modal");

    combined.initializeAppKitModal(btcConfig());

    expect(() => eth.initializeAppKitModal(ethConfig())).toThrow("already initialized without Ethereum support");
    expect(mocks.createAppKit).toHaveBeenCalledTimes(1);
  });

  it("reuses the combined modal and adapter configs through each entry point", async () => {
    const combined = await import("../appKitModal");
    const eth = await import("../../eth/appkit/modal");

    const first = combined.initializeAppKitModal(combinedConfig());
    const ethOnly = eth.initializeAppKitModal(ethConfig());
    const btcOnly = combined.initializeAppKitModal(btcConfig());

    expect(ethOnly?.modal).toBe(first?.modal);
    expect(ethOnly?.wagmiConfig).toBe(first?.wagmiConfig);
    expect(btcOnly?.bitcoinAdapter).toBe(first?.bitcoinAdapter);
  });

  it("exposes the canonical adapter configs through the shared getters", async () => {
    const combined = await import("../appKitModal");
    const ethShared = await import("../../eth/appkit/sharedConfig");
    const btcShared = await import("../../btc/appkit/sharedConfig");

    const first = combined.initializeAppKitModal(combinedConfig());
    const btcConfig = btcShared.getSharedBtcAppKitConfig();

    expect(ethShared.getSharedWagmiConfig()).toBe(first?.wagmiConfig);
    expect(btcConfig.modal).toBe(first?.modal);
    expect(btcConfig.adapter).toBe(first?.bitcoinAdapter);
    expect(btcConfig.network).toBe("signet");
    expect(btcConfig.connectionEvents).toBeInstanceOf(EventTarget);
  });

  it("reuses the canonical Bitcoin connection event bus", async () => {
    const combined = await import("../appKitModal");
    const btcShared = await import("../../btc/appkit/sharedConfig");

    combined.initializeAppKitModal(combinedConfig());
    const btcConfig = btcShared.getSharedBtcAppKitConfig();

    expect(btcShared.getSharedBtcAppKitConfig().connectionEvents).toBe(btcConfig.connectionEvents);
  });

  it("freezes the canonical AppKit state", async () => {
    const combined = await import("../appKitModal");
    const state = await import("../state");

    combined.initializeAppKitModal(combinedConfig());

    expect(Object.isFrozen(state.getAppKitState())).toBe(true);
    expect(Object.isFrozen(state.getAppKitState()?.btcConfig)).toBe(true);
  });

  it("creates one modal for compatible entry point calls", async () => {
    const combined = await import("../appKitModal");
    const eth = await import("../../eth/appkit/modal");

    combined.initializeAppKitModal(combinedConfig());
    eth.initializeAppKitModal(ethConfig());
    combined.initializeAppKitModal(btcConfig());

    expect(mocks.createAppKit).toHaveBeenCalledTimes(1);
  });

  it.each(["Ethereum", "Bitcoin"] as const)(
    "rejects a manual %s config after canonical initialization without that capability",
    async (capability) => {
      const combined = await import("../appKitModal");
      const eth = await import("../../eth/appkit/modal");
      const ethShared = await import("../../eth/appkit/sharedConfig");
      const btcShared = await import("../../btc/appkit/sharedConfig");

      if (capability === "Ethereum") {
        combined.initializeAppKitModal(btcConfig());

        expect(() => ethShared.setSharedWagmiConfig({ id: "manual" } as never)).toThrow(
          "Cannot set a manual Ethereum AppKit configuration",
        );
        expect(ethShared.hasSharedWagmiConfig()).toBe(false);
        expect(() => ethShared.getSharedWagmiConfig()).toThrow("initialized without Ethereum support");
      } else {
        eth.initializeAppKitModal(ethConfig());

        expect(() =>
          btcShared.setSharedBtcAppKitConfig({ modal: {} as never, adapter: {} as never, network: "signet" }),
        ).toThrow("Cannot set a manual Bitcoin AppKit configuration");
        expect(btcShared.hasSharedBtcAppKitConfig()).toBe(false);
        expect(() => btcShared.getSharedBtcAppKitConfig()).toThrow("initialized without Bitcoin support");
      }
    },
  );

  it.each(["Ethereum", "Bitcoin"] as const)(
    "rejects canonical initialization after a manual %s config",
    async (capability) => {
      const combined = await import("../appKitModal");
      const eth = await import("../../eth/appkit/modal");
      const ethShared = await import("../../eth/appkit/sharedConfig");
      const btcShared = await import("../../btc/appkit/sharedConfig");
      const state = await import("../state");

      if (capability === "Ethereum") {
        ethShared.setSharedWagmiConfig({ id: "manual" } as never);
        expect(() => eth.initializeAppKitModal(ethConfig())).toThrow(
          "Cannot initialize AppKit after a manual Ethereum configuration",
        );
      } else {
        btcShared.setSharedBtcAppKitConfig({ modal: {} as never, adapter: {} as never, network: "signet" });
        expect(() => combined.initializeAppKitModal(btcConfig())).toThrow(
          "Cannot initialize AppKit after a manual Bitcoin configuration",
        );
      }

      expect(state.getAppKitState()).toBeNull();
      expect(mocks.createAppKit).not.toHaveBeenCalled();
    },
  );

  it("does not register a manual Bitcoin config when config resolution fails", async () => {
    const combined = await import("../appKitModal");
    const btcShared = await import("../../btc/appkit/sharedConfig");
    const error = new Error("modal read failed");
    const unresolvedConfig = {
      get modal(): never {
        throw error;
      },
      adapter: {} as never,
      network: "signet" as const,
    };

    expect(() => btcShared.setSharedBtcAppKitConfig(unresolvedConfig)).toThrow(error);
    expect(btcShared.hasSharedBtcAppKitConfig()).toBe(false);
    expect(combined.initializeAppKitModal(btcConfig())).not.toBeNull();
  });

  it("clears the manual Bitcoin registry with the test reset helper", async () => {
    const combined = await import("../appKitModal");
    const btcShared = await import("../../btc/appkit/sharedConfig");

    btcShared.setSharedBtcAppKitConfig({ modal: {} as never, adapter: {} as never, network: "signet" });
    btcShared.__resetSharedBtcAppKitConfigForTests();

    expect(btcShared.hasSharedBtcAppKitConfig()).toBe(false);
    expect(combined.initializeAppKitModal(btcConfig())).not.toBeNull();
  });

  it("returns the shared Wagmi configuration through the combined entry point", async () => {
    const eth = await import("../../eth/appkit/modal");
    const combined = await import("../appKitModal");

    const first = eth.initializeAppKitModal(ethConfig());
    const second = combined.initializeAppKitModal(ethConfig());

    expect(second?.modal).toBe(first?.modal);
    expect(second?.wagmiConfig).toBe(first?.wagmiConfig);
    expect(second?.wagmiConfig).toBeDefined();
  });

  it.each([
    ["RPC configuration", { ...ethChain, rpcUrls: { default: { http: ["https://other-rpc.example.com"] } } }],
    ["native currency", { ...ethChain, nativeCurrency: { ...ethChain.nativeCurrency, symbol: "TEST" } }],
  ])("rejects a different Ethereum %s", async (_name, requestedChain) => {
    const eth = await import("../../eth/appkit/modal");

    eth.initializeAppKitModal(ethConfig());

    expect(() => eth.initializeAppKitModal(ethConfig(requestedChain))).toThrow(
      "different Ethereum chain configuration",
    );
  });

  it("rejects a different Bitcoin network", async () => {
    const combined = await import("../appKitModal");

    combined.initializeAppKitModal(btcConfig());

    expect(() => combined.initializeAppKitModal(btcConfig("mainnet"))).toThrow("different Bitcoin network");
  });

  it("rejects a different project ID", async () => {
    const eth = await import("../../eth/appkit/modal");

    eth.initializeAppKitModal(ethConfig());

    expect(() => eth.initializeAppKitModal({ ...ethConfig(), projectId: "other-project" })).toThrow(
      "different project ID",
    );
  });

  it("rejects different application metadata", async () => {
    const eth = await import("../../eth/appkit/modal");

    eth.initializeAppKitModal(ethConfig());

    expect(() => eth.initializeAppKitModal({ ...ethConfig(), metadata: { ...metadata, name: "Other App" } })).toThrow(
      "different metadata",
    );
  });

  it("allows a first missing project ID but rejects it after initialization", async () => {
    const combined = await import("../appKitModal");
    const missingProjectId = { ...btcConfig(), projectId: undefined };

    expect(combined.initializeAppKitModal(missingProjectId)).toBeNull();
    combined.initializeAppKitModal(btcConfig());

    expect(() => combined.initializeAppKitModal(missingProjectId)).toThrow("A project ID is required");
  });

  it.each(["Ethereum adapter", "Bitcoin adapter", "AppKit modal"])(
    "retries after a %s failure without publishing partial state",
    async (failurePoint) => {
      const error = new Error(`${failurePoint} failed`);
      const combined = await import("../appKitModal");
      const state = await import("../state");
      const ethShared = await import("../../eth/appkit/sharedConfig");
      const btcShared = await import("../../btc/appkit/sharedConfig");

      if (failurePoint === "Ethereum adapter") {
        mocks.wagmiError = error;
      } else if (failurePoint === "Bitcoin adapter") {
        mocks.bitcoinError = error;
      } else {
        mocks.createAppKit.mockImplementationOnce(() => {
          throw error;
        });
      }

      expect(() => combined.initializeAppKitModal(combinedConfig())).toThrow(error);
      expect(state.getAppKitState()).toBeNull();
      expect(ethShared.hasSharedWagmiConfig()).toBe(false);
      expect(btcShared.hasSharedBtcAppKitConfig()).toBe(false);

      mocks.wagmiError = null;
      mocks.bitcoinError = null;
      const retry = combined.initializeAppKitModal(combinedConfig());

      expect(retry?.wagmiConfig).toBeDefined();
      expect(retry?.bitcoinAdapter).toBeDefined();
      expect(state.getAppKitState()?.modal).toBe(retry?.modal);
    },
  );
});
