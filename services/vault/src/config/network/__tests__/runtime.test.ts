import { describe, expect, it } from "vitest";

import { BTC_MAINNET, BTC_SIGNET } from "../constants";
import { resolveMempoolApiUrl } from "../runtime";

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
