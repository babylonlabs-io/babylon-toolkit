import { afterEach, describe, expect, it, vi } from "vitest";

import {
  captureAttribution,
  deriveAttribution,
  getAttribution,
} from "../attribution";

const APP_HOST = "btc-vaults.testnet.babylonlabs.io";

function cookieOf(source: Record<string, unknown>): string {
  return `other=1; bbn_src=${encodeURIComponent(JSON.stringify(source))}`;
}

describe("deriveAttribution", () => {
  it("takes campaign parameters from the landing URL", () => {
    expect(
      deriveAttribution({
        search: "?utm_source=x&utm_medium=social&twclid=abc&reserve=7",
        referrer: "",
        cookie: "",
        ownHost: APP_HOST,
      }),
    ).toEqual({
      utm_source: "x",
      utm_medium: "social",
      twclid: "abc",
      $referring_domain: "$direct",
      via: "other",
    });
  });

  it("ignores the website cookie when the URL carries campaign parameters", () => {
    expect(
      deriveAttribution({
        search: "?gclid=g1",
        referrer: "",
        cookie: cookieOf({ utm_source: "newsletter" }),
        ownHost: APP_HOST,
      }),
    ).toEqual({ gclid: "g1", $referring_domain: "$direct", via: "other" });
  });

  it("falls back to the website cookie when the URL has no campaign parameters", () => {
    expect(
      deriveAttribution({
        search: "",
        referrer: "https://babylonlabs.io/tbv",
        cookie: cookieOf({ utm_source: "x", utm_medium: "social" }),
        ownHost: APP_HOST,
      }),
    ).toEqual({
      utm_source: "x",
      utm_medium: "social",
      $referring_domain: "babylonlabs.io",
      via: "website",
    });
  });

  it("keeps only known string keys from the cookie", () => {
    expect(
      deriveAttribution({
        search: "",
        referrer: "",
        cookie: cookieOf({
          utm_source: "x",
          utm_campaign: 5,
          wallet: "0xabc",
        }),
        ownHost: APP_HOST,
      }),
    ).toEqual({ utm_source: "x", $referring_domain: "$direct", via: "other" });
  });

  it("treats a malformed cookie as no source", () => {
    expect(
      deriveAttribution({
        search: "",
        referrer: "",
        cookie: "bbn_src=%7Bnot-json",
        ownHost: APP_HOST,
      }),
    ).toEqual({ $referring_domain: "$direct", via: "other" });
  });

  it("treats a cookie that is valid JSON but not an object as no source", () => {
    expect(
      deriveAttribution({
        search: "",
        referrer: "",
        cookie: "bbn_src=5",
        ownHost: APP_HOST,
      }),
    ).toEqual({ $referring_domain: "$direct", via: "other" });
  });

  it("truncates cookie values to 100 characters", () => {
    const result = deriveAttribution({
      search: "",
      referrer: "",
      cookie: cookieOf({ utm_campaign: "y".repeat(150) }),
      ownHost: APP_HOST,
    });
    expect(result.utm_campaign).toBe("y".repeat(100));
  });

  it("scrubs an address out of a campaign value in the URL", () => {
    const result = deriveAttribution({
      search: `?utm_term=wallet-0x${"ab".repeat(20)}`,
      referrer: "",
      cookie: "",
      ownHost: APP_HOST,
    });
    expect(result.utm_term).toBe("wallet-[ETH_ADDR]");
  });

  it("scrubs an address out of a campaign value in the cookie", () => {
    const result = deriveAttribution({
      search: "",
      referrer: "",
      cookie: cookieOf({
        utm_content: "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
      }),
      ownHost: APP_HOST,
    });
    expect(result.utm_content).toBe("[BTC_ADDR]");
  });

  it("scrubs an address before truncating, so a cut address is not sent", () => {
    const result = deriveAttribution({
      search: `?utm_term=${"x".repeat(80)}-0x${"cd".repeat(20)}`,
      referrer: "",
      cookie: "",
      ownHost: APP_HOST,
    });
    expect(result.utm_term).toBe(`${"x".repeat(80)}-[ETH_ADDR]`);
  });

  it("truncates URL values to 100 characters", () => {
    const result = deriveAttribution({
      search: `?utm_campaign=${"x".repeat(150)}`,
      referrer: "",
      cookie: "",
      ownHost: APP_HOST,
    });
    expect(result.utm_campaign).toBe("x".repeat(100));
  });

  it("reports an external referrer by hostname only", () => {
    expect(
      deriveAttribution({
        search: "",
        referrer: "https://www.google.com/search?q=bitcoin+vaults",
        cookie: "",
        ownHost: APP_HOST,
      }),
    ).toEqual({ $referring_domain: "www.google.com", via: "other" });
  });

  it("does not count any btc-vaults host as a referrer", () => {
    for (const referrer of [
      `https://${APP_HOST}/vaults`,
      "https://btc-vaults.babylonlabs.io/",
    ]) {
      expect(
        deriveAttribution({
          search: "",
          referrer,
          cookie: "",
          ownHost: APP_HOST,
        }),
      ).toEqual({ $referring_domain: "$direct", via: "other" });
    }
  });

  it("does not count the current host as a referrer when it is not a btc-vaults host", () => {
    expect(
      deriveAttribution({
        search: "",
        referrer: "http://localhost:5173/vaults",
        cookie: "",
        ownHost: "localhost",
      }),
    ).toEqual({ $referring_domain: "$direct", via: "other" });
  });

  it("marks a visit from www.babylonlabs.io as from the website", () => {
    expect(
      deriveAttribution({
        search: "",
        referrer: "https://www.babylonlabs.io/",
        cookie: "",
        ownHost: APP_HOST,
      }).via,
    ).toBe("website");
  });

  it("does not count another babylonlabs.io subdomain as the website", () => {
    expect(
      deriveAttribution({
        search: "",
        referrer: "https://docs.babylonlabs.io/guides",
        cookie: "",
        ownHost: APP_HOST,
      }).via,
    ).toBe("other");
  });

  it("ignores the website cookie when the visit came from another site", () => {
    expect(
      deriveAttribution({
        search: "",
        referrer: "https://www.google.com/",
        cookie: cookieOf({ utm_source: "x", utm_medium: "social" }),
        ownHost: APP_HOST,
      }),
    ).toEqual({ $referring_domain: "www.google.com", via: "other" });
  });
});

describe("captureAttribution", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("leaves the visit without attribution when the cookie cannot be read", () => {
    vi.spyOn(document, "cookie", "get").mockImplementation(() => {
      throw new DOMException("opaque origin", "SecurityError");
    });
    expect(() => captureAttribution()).not.toThrow();
    expect(getAttribution()).toBeNull();
  });
});
