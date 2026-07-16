import { describe, expect, it } from "vitest";

import { BTC_MAINNET, BTC_SIGNET } from "../constants";
import { resolveMempoolApiUrl } from "../runtime";

// The reader appends `/api`, so these assert the base the network config stores.
describe("resolveMempoolApiUrl", () => {
  it("derives the signet path for the public mempool.space host", () => {
    // Guards the footgun: a signet app pointed at the bare mempool.space root
    // must NOT read mainnet data — the /signet path is derived from the network.
    expect(resolveMempoolApiUrl("https://mempool.space", BTC_SIGNET)).toBe(
      "https://mempool.space/signet",
    );
  });

  it("uses the mempool.space root for mainnet", () => {
    expect(resolveMempoolApiUrl("https://mempool.space", BTC_MAINNET)).toBe(
      "https://mempool.space",
    );
  });

  it("lets the network drive the mempool.space path regardless of the supplied path", () => {
    // A stale value already carrying /signet stays correct on signet...
    expect(
      resolveMempoolApiUrl("https://mempool.space/signet", BTC_SIGNET),
    ).toBe("https://mempool.space/signet");
    // ...and is corrected back to the root on mainnet (network wins).
    expect(
      resolveMempoolApiUrl("https://mempool.space/signet", BTC_MAINNET),
    ).toBe("https://mempool.space");
  });

  it("uses a custom/self-hosted signet host verbatim (no /signet appended)", () => {
    expect(
      resolveMempoolApiUrl("https://mempool.example.com", BTC_SIGNET),
    ).toBe("https://mempool.example.com");
  });

  it("defaults to the network-correct mempool.space URL when unset", () => {
    expect(resolveMempoolApiUrl(undefined, BTC_SIGNET)).toBe(
      "https://mempool.space/signet",
    );
    expect(resolveMempoolApiUrl(undefined, BTC_MAINNET)).toBe(
      "https://mempool.space",
    );
  });

  it("trims a trailing slash", () => {
    expect(
      resolveMempoolApiUrl("https://mempool.example.com/", BTC_SIGNET),
    ).toBe("https://mempool.example.com");
  });

  it("throws on a malformed URL rather than silently continuing", () => {
    expect(() => resolveMempoolApiUrl("not a url", BTC_SIGNET)).toThrow(
      /Invalid NEXT_PUBLIC_MEMPOOL_API/,
    );
  });
});
