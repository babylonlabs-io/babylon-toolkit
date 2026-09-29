import { describe, expect, it, vi } from "vitest";

vi.mock("@/config/env", () => ({
  ENV: { VP_PROXY_URL: "https://proxy.test" },
}));

import { getVpProxyUrl } from "../vpProxy";

describe("getVpProxyUrl", () => {
  it("maps the checksummed and the lowercase form of one address to one URL", () => {
    // The chain returns checksummed addresses and the indexer returns
    // lowercase ones. The VP token cache matches URLs exactly, so the two
    // forms must not produce two URLs.
    const checksummed = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
    const lowercase = "0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed";

    expect(getVpProxyUrl(checksummed)).toBe(
      "https://proxy.test/rpc/0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed",
    );
    expect(getVpProxyUrl(lowercase)).toBe(getVpProxyUrl(checksummed));
  });
});
