import { beforeEach, describe, expect, it, vi } from "vitest";

import { BTC_MAINNET, BTC_SIGNET } from "../constants";
import { resolveMempoolApiUrl } from "../runtime";

vi.unmock("@/config/network");

// The reader appends `/api`, so these assert the base the network config stores.
describe("resolveMempoolApiUrl", () => {
  it("appends the /signet path for signet", () => {
    expect(resolveMempoolApiUrl("https://mempool.space", BTC_SIGNET)).toBe(
      "https://mempool.space/signet",
    );
  });

  it("leaves mainnet at the host root", () => {
    expect(resolveMempoolApiUrl("https://mempool.space", BTC_MAINNET)).toBe(
      "https://mempool.space",
    );
  });

  it("appends /signet to a custom host too (every mempool host serves signet under /signet)", () => {
    expect(
      resolveMempoolApiUrl("https://mempool.example.com", BTC_SIGNET),
    ).toBe("https://mempool.example.com/signet");
  });

  it("does not double /signet when the base already carries it", () => {
    expect(
      resolveMempoolApiUrl("https://mempool.space/signet", BTC_SIGNET),
    ).toBe("https://mempool.space/signet");
  });

  it("defaults to mempool.space per network when unset", () => {
    expect(resolveMempoolApiUrl(undefined, BTC_SIGNET)).toBe(
      "https://mempool.space/signet",
    );
    expect(resolveMempoolApiUrl(undefined, BTC_MAINNET)).toBe(
      "https://mempool.space",
    );
  });

  it("trims a trailing slash before appending", () => {
    expect(
      resolveMempoolApiUrl("https://mempool.example.com/", BTC_SIGNET),
    ).toBe("https://mempool.example.com/signet");
  });
});

const BASE_OPTIONS = {
  kind: "test" as const,
  ethChainId: 11155111 as const,
  ethRpcUrl: "https://rpc.example",
  btcNetwork: "signet" as const,
};

async function freshRuntime() {
  vi.resetModules();
  return import("../runtime");
}

describe("configureBabylonConfig", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("accepts a test profile on signet + Sepolia and exposes its kind", async () => {
    const runtime = await freshRuntime();
    runtime.configureBabylonConfig(BASE_OPTIONS);
    expect(runtime.getDeploymentKind()).toBe("test");
  });

  it("shows the BTC symbol, orange icon and Bitcoin name on signet", async () => {
    const runtime = await freshRuntime();
    runtime.configureBabylonConfig(BASE_OPTIONS);
    const { getNetworkConfigBTC } = await import("../../btc");
    expect(getNetworkConfigBTC()).toEqual({
      coinName: "Signet BTC",
      coinSymbol: "BTC",
      networkName: "BTC signet",
      mempoolApiUrl: "https://mempool.space/signet",
      network: BTC_SIGNET,
      icon: "/images/btc.svg",
      name: "Bitcoin",
      displayUSD: false,
    });
  });

  it("accepts an internal profile on BTC mainnet + Sepolia", async () => {
    const runtime = await freshRuntime();
    expect(() =>
      runtime.configureBabylonConfig({
        ...BASE_OPTIONS,
        kind: "internal",
        btcNetwork: "mainnet",
      }),
    ).not.toThrow();
  });

  it("rejects BTC mainnet + Sepolia for a test profile", async () => {
    const runtime = await freshRuntime();
    expect(() =>
      runtime.configureBabylonConfig({
        ...BASE_OPTIONS,
        btcNetwork: "mainnet",
      }),
    ).toThrow('Invalid network pairing for kind "test"');
  });

  it("rejects an empty RPC URL", async () => {
    const runtime = await freshRuntime();
    expect(() =>
      runtime.configureBabylonConfig({ ...BASE_OPTIONS, ethRpcUrl: "" }),
    ).toThrow("ethRpcUrl is required");
  });

  it("throws on a second call", async () => {
    const runtime = await freshRuntime();
    runtime.configureBabylonConfig(BASE_OPTIONS);
    expect(() => runtime.configureBabylonConfig(BASE_OPTIONS)).toThrow(
      "configureBabylonConfig() has already been called",
    );
  });

  it("appends /signet to the mempool host for signet", async () => {
    const runtime = await freshRuntime();
    runtime.configureBabylonConfig({
      ...BASE_OPTIONS,
      mempoolApiUrl: "https://mempool.signet.babylonlabs.io",
    });
    expect(runtime.getBabylonConfigState().mempoolApiUrl).toBe(
      "https://mempool.signet.babylonlabs.io/signet",
    );
  });
});
