import { describe, expect, it } from "vitest";

import { BTC_MAINNET, BTC_SIGNET, ETH_SEPOLIA_CHAIN_ID } from "../constants";
import {
  configureBabylonConfig,
  resolveBitcoinObserverApiUrl,
  resolveMempoolApiUrl,
} from "../runtime";

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

describe("resolveBitcoinObserverApiUrl", () => {
  it("defaults to blockstream.info on a separate origin", () => {
    expect(resolveBitcoinObserverApiUrl(undefined, BTC_SIGNET)).toBe(
      "https://blockstream.info/signet",
    );
    expect(resolveBitcoinObserverApiUrl(undefined, BTC_MAINNET)).toBe(
      "https://blockstream.info",
    );
  });

  it("normalizes a custom observer host for signet", () => {
    expect(
      resolveBitcoinObserverApiUrl(
        "https://bitcoin-observer.example/",
        BTC_SIGNET,
      ),
    ).toBe("https://bitcoin-observer.example/signet");
  });

  it("rejects an observer on the broadcaster origin", () => {
    expect(() =>
      configureBabylonConfig({
        ethChainId: ETH_SEPOLIA_CHAIN_ID,
        ethRpcUrl: "https://ethereum.example",
        btcNetwork: BTC_SIGNET,
        mempoolApiUrl: "https://bitcoin.example/broadcast",
        bitcoinObserverApiUrl: "https://bitcoin.example/observe",
      }),
    ).toThrow("Bitcoin broadcaster and observer must use different origins");
  });
});
