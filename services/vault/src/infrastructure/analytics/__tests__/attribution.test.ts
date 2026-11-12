import { afterEach, describe, expect, it, vi } from "vitest";

import { deriveAttribution } from "../attribution";

const { mockWarn } = vi.hoisted(() => ({ mockWarn: vi.fn() }));
vi.mock("../../logger", () => ({
  default: { warn: mockWarn, error: vi.fn() },
}));

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

  it("scrubs an address joined directly to letters out of a campaign value in the URL", () => {
    const result = deriveAttribution({
      search: `?utm_term=wallet0x${"ab".repeat(20)}v2`,
      referrer: "",
      cookie: "",
      ownHost: APP_HOST,
    });
    expect(result.utm_term).toBe("wallet[ETH_ADDR]v2");
  });

  it("scrubs an address joined directly to letters out of a campaign value in the cookie", () => {
    const result = deriveAttribution({
      search: "",
      referrer: "",
      cookie: cookieOf({
        utm_content: "usertb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
      }),
      ownHost: APP_HOST,
    });
    expect(result.utm_content).toBe("user[BTC_ADDR]");
  });

  it("scrubs a legacy Bitcoin address joined with underscores", () => {
    const result = deriveAttribution({
      search: "?utm_term=ref_1BoatSLRHtKNngkdXEeobR76b53LETtpyT_x",
      referrer: "",
      cookie: "",
      ownHost: APP_HOST,
    });
    expect(result.utm_term).toBe("ref_[BTC_ADDR]_x");
  });

  it("sends a click id unchanged even where a campaign value would be scrubbed", () => {
    const twclid = "1xyzxyzxyzxyzxyzxyzxyzxyzxyz";
    const result = deriveAttribution({
      search: `?twclid=${twclid}`,
      referrer: "",
      cookie: "",
      ownHost: APP_HOST,
    });
    expect(result.twclid).toBe(twclid);
  });

  it("sends a click id longer than 100 characters uncut", () => {
    const gclid = `Cj0K${"x".repeat(200)}_BwE`;
    const result = deriveAttribution({
      search: `?gclid=${gclid}`,
      referrer: "",
      cookie: "",
      ownHost: APP_HOST,
    });
    expect(result.gclid).toBe(gclid);
  });

  it("drops a click id that is not a plain token", () => {
    const result = deriveAttribution({
      search: "?utm_source=x&gclid=user%40example.com",
      referrer: "",
      cookie: "",
      ownHost: APP_HOST,
    });
    expect(result).toEqual({
      utm_source: "x",
      $referring_domain: "$direct",
      via: "other",
    });
  });

  it("keeps the website cookie out when the URL's only campaign key is a dropped click id", () => {
    const result = deriveAttribution({
      search: "?gclid=a%40b",
      referrer: "",
      cookie: cookieOf({ utm_source: "x" }),
      ownHost: APP_HOST,
    });
    expect(result).toEqual({ $referring_domain: "$direct", via: "other" });
  });

  it("drops a click id longer than 255 characters", () => {
    const result = deriveAttribution({
      search: "",
      referrer: "",
      cookie: cookieOf({ gclid: "x".repeat(256) }),
      ownHost: APP_HOST,
    });
    expect(result.gclid).toBeUndefined();
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

  it("leaves the visit without attribution and warns when the cookie cannot be read", async () => {
    vi.resetModules();
    const { captureAttribution, getAttribution } = await import(
      "../attribution"
    );
    vi.spyOn(document, "cookie", "get").mockImplementation(() => {
      throw new DOMException("opaque origin", "SecurityError");
    });

    expect(() => captureAttribution()).not.toThrow();

    expect(getAttribution()).toBeNull();
    expect(mockWarn).toHaveBeenCalledWith(
      "Analytics attribution unavailable: SecurityError: opaque origin",
      { category: "analytics" },
    );
  });
});
