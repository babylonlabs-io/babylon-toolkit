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
      via: "direct",
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
    ).toEqual({ gclid: "g1", $referring_domain: "$direct", via: "direct" });
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
    ).toEqual({ utm_source: "x", $referring_domain: "$direct", via: "direct" });
  });

  it("treats a malformed cookie as no source", () => {
    expect(
      deriveAttribution({
        search: "",
        referrer: "",
        cookie: "bbn_src=%7Bnot-json",
        ownHost: APP_HOST,
      }),
    ).toEqual({ $referring_domain: "$direct", via: "direct" });
  });

  it("truncates values to 100 characters", () => {
    const result = deriveAttribution({
      search: `?utm_campaign=${"a".repeat(150)}`,
      referrer: "",
      cookie: "",
      ownHost: APP_HOST,
    });
    expect(result.utm_campaign).toBe("a".repeat(100));
  });

  it("reports an external referrer by hostname only", () => {
    expect(
      deriveAttribution({
        search: "",
        referrer: "https://www.google.com/search?q=bitcoin+vaults",
        cookie: "",
        ownHost: APP_HOST,
      }),
    ).toEqual({ $referring_domain: "www.google.com", via: "direct" });
  });

  it("does not count the app's own hosts as a referrer", () => {
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
      ).toEqual({ $referring_domain: "$direct", via: "direct" });
    }
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
    ).toBe("direct");
  });

  it("ignores the website cookie when the visit came from another site", () => {
    expect(
      deriveAttribution({
        search: "",
        referrer: "https://www.google.com/",
        cookie: cookieOf({ utm_source: "x", utm_medium: "social" }),
        ownHost: APP_HOST,
      }),
    ).toEqual({ $referring_domain: "www.google.com", via: "direct" });
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
