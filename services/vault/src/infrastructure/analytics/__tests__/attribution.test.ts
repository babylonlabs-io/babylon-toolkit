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

  it("treats a malformed cookie as no source and warns without its value", () => {
    mockWarn.mockClear();
    expect(
      deriveAttribution({
        search: "",
        referrer: "",
        cookie: "bbn_src=%7Bnot-json",
        ownHost: APP_HOST,
      }),
    ).toEqual({ $referring_domain: "$direct", via: "other" });
    expect(mockWarn).toHaveBeenCalledWith(
      "Analytics source cookie is malformed; the visit has no source",
      { category: "analytics" },
    );
  });

  it("treats a cookie that is valid JSON but not an object as no source and warns", () => {
    mockWarn.mockClear();
    expect(
      deriveAttribution({
        search: "",
        referrer: "",
        cookie: "bbn_src=5",
        ownHost: APP_HOST,
      }),
    ).toEqual({ $referring_domain: "$direct", via: "other" });
    expect(mockWarn).toHaveBeenCalledWith(
      "Analytics source cookie is malformed; the visit has no source",
      { category: "analytics" },
    );
  });

  it("treats a cookie holding JSON null as no source and warns", () => {
    mockWarn.mockClear();
    expect(
      deriveAttribution({
        search: "",
        referrer: "",
        cookie: "bbn_src=null",
        ownHost: APP_HOST,
      }),
    ).toEqual({ $referring_domain: "$direct", via: "other" });
    expect(mockWarn).toHaveBeenCalledWith(
      "Analytics source cookie is malformed; the visit has no source",
      { category: "analytics" },
    );
  });

  it("drops an empty campaign value from the cookie", () => {
    expect(
      deriveAttribution({
        search: "",
        referrer: "",
        cookie: cookieOf({ utm_source: "" }),
        ownHost: APP_HOST,
      }),
    ).toEqual({ $referring_domain: "$direct", via: "other" });
  });

  it("truncates by code point, so an emoji at the limit is kept whole", () => {
    const result = deriveAttribution({
      search: `?utm_campaign=${"x".repeat(99)}%F0%9F%98%80b`,
      referrer: "",
      cookie: "",
      ownHost: APP_HOST,
    });
    expect(result.utm_campaign).toBe(`${"x".repeat(99)}\u{1F600}`);
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

  it("scrubs 0x-prefixed hex longer than an address as a whole", () => {
    const result = deriveAttribution({
      search: `?utm_term=a0x${"ab".repeat(32)}`,
      referrer: "",
      cookie: "",
      ownHost: APP_HOST,
    });
    expect(result.utm_term).toBe("a[HEX_REDACTED]");
  });

  it("scrubs a bare 64-character hex run", () => {
    const result = deriveAttribution({
      search: `?utm_content=${"cd".repeat(32)}`,
      referrer: "",
      cookie: "",
      ownHost: APP_HOST,
    });
    expect(result.utm_content).toBe("[HEX_REDACTED]");
  });

  it("scrubs a bare 40-character hex value as an Ethereum address", () => {
    const result = deriveAttribution({
      search: `?utm_term=ref-${"ab".repeat(20)}`,
      referrer: "",
      cookie: "",
      ownHost: APP_HOST,
    });
    expect(result.utm_term).toBe("ref-[ETH_ADDR]");
  });

  it("scrubs a bare Ethereum address preceded by hex letters", () => {
    const result = deriveAttribution({
      search: `?utm_term=ref${"ab".repeat(20)}`,
      referrer: "",
      cookie: "",
      ownHost: APP_HOST,
    });
    expect(result.utm_term).toBe("r[ETH_ADDR]");
  });

  it("scrubs a bare Ethereum address followed by hex letters", () => {
    const result = deriveAttribution({
      search: `?utm_term=${"ab".repeat(20)}cafe`,
      referrer: "",
      cookie: "",
      ownHost: APP_HOST,
    });
    expect(result.utm_term).toBe("[ETH_ADDR]");
  });

  it("scrubs an Ethereum address with an uppercase 0X", () => {
    const result = deriveAttribution({
      search: `?utm_term=0X${"AB".repeat(20)}`,
      referrer: "",
      cookie: "",
      ownHost: APP_HOST,
    });
    expect(result.utm_term).toBe("[ETH_ADDR]");
  });

  it("scrubs an uppercase bech32 address joined to letters", () => {
    const result = deriveAttribution({
      search: "?utm_term=walletBC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KXPJZSX",
      referrer: "",
      cookie: "",
      ownHost: APP_HOST,
    });
    expect(result.utm_term).toBe("wallet[BTC_ADDR]");
  });

  it("scrubs a Babylon address", () => {
    const result = deriveAttribution({
      search: `?utm_term=bbn1${"q".repeat(38)}`,
      referrer: "",
      cookie: "",
      ownHost: APP_HOST,
    });
    expect(result.utm_term).toBe("[BBN_ADDR]");
  });

  it("scrubs a testnet legacy Bitcoin address", () => {
    const result = deriveAttribution({
      search: "?utm_term=ref_mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn",
      referrer: "",
      cookie: "",
      ownHost: APP_HOST,
    });
    expect(result.utm_term).toBe("ref_[BTC_ADDR]");
  });

  it("scrubs a value that is only a legacy Bitcoin address", () => {
    const result = deriveAttribution({
      search: "?utm_term=1BoatSLRHtKNngkdXEeobR76b53LETtpyT",
      referrer: "",
      cookie: "",
      ownHost: APP_HOST,
    });
    expect(result.utm_term).toBe("[BTC_ADDR]");
  });

  it("scrubs a mainnet P2SH legacy Bitcoin address", () => {
    const result = deriveAttribution({
      search: "?utm_term=ref_3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy",
      referrer: "",
      cookie: "",
      ownHost: APP_HOST,
    });
    expect(result.utm_term).toBe("ref_[BTC_ADDR]");
  });

  it("scrubs a testnet legacy Bitcoin address starting with n", () => {
    const result = deriveAttribution({
      search: "?utm_term=ref_n4VQ5YdHf7hLQ2gWQYYrcxoE5B7nWuDFNF",
      referrer: "",
      cookie: "",
      ownHost: APP_HOST,
    });
    expect(result.utm_term).toBe("ref_[BTC_ADDR]");
  });

  it("scrubs a 35-character testnet P2SH address", () => {
    const result = deriveAttribution({
      search: "?utm_term=ref_2N8hwP1WmJrFF5QWABn38y63uYLhnJYJYTF",
      referrer: "",
      cookie: "",
      ownHost: APP_HOST,
    });
    expect(result.utm_term).toBe("ref_[BTC_ADDR]");
  });

  it("leaves a legacy-shaped run followed directly by letters, as documented", () => {
    const result = deriveAttribution({
      search: "?utm_campaign=ref_1BoatSLRHtKNngkdXEeobR76b53LETtpyTxyz",
      referrer: "",
      cookie: "",
      ownHost: APP_HOST,
    });
    expect(result.utm_campaign).toBe(
      "ref_1BoatSLRHtKNngkdXEeobR76b53LETtpyTxyz",
    );
  });

  it("leaves a legacy-shaped run joined directly to a letter, as documented", () => {
    const result = deriveAttribution({
      search: "?utm_campaign=x1BoatSLRHtKNngkdXEeobR76b53LETtpyT",
      referrer: "",
      cookie: "",
      ownHost: APP_HOST,
    });
    expect(result.utm_campaign).toBe("x1BoatSLRHtKNngkdXEeobR76b53LETtpyT");
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

  it("keeps a click id of exactly 255 characters", () => {
    const gclid = "a".repeat(255);
    const result = deriveAttribution({
      search: `?gclid=${gclid}`,
      referrer: "",
      cookie: "",
      ownHost: APP_HOST,
    });
    expect(result.gclid).toBe(gclid);
  });

  it("drops a click id with a dot", () => {
    const result = deriveAttribution({
      search: "?gclid=a.b",
      referrer: "",
      cookie: "",
      ownHost: APP_HOST,
    });
    expect(result.gclid).toBeUndefined();
  });

  it("falls back to the website cookie when the URL's campaign key is empty", () => {
    const result = deriveAttribution({
      search: "?utm_source=",
      referrer: "",
      cookie: cookieOf({ utm_source: "x" }),
      ownHost: APP_HOST,
    });
    expect(result.utm_source).toBe("x");
  });

  it("does not warn when there is no source cookie", () => {
    mockWarn.mockClear();
    deriveAttribution({
      search: "",
      referrer: "",
      cookie: "other=1",
      ownHost: APP_HOST,
    });
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it("reads only the bbn_src cookie, not one whose name ends with it", () => {
    const result = deriveAttribution({
      search: "",
      referrer: "",
      cookie: `xbbn_src=${encodeURIComponent(JSON.stringify({ utm_source: "x" }))}`,
      ownHost: APP_HOST,
    });
    expect(result).toEqual({ $referring_domain: "$direct", via: "other" });
  });

  it("counts a btc-vaults host on another domain as an external referrer", () => {
    const result = deriveAttribution({
      search: "",
      referrer: "https://btc-vaults.evil.com/",
      cookie: "",
      ownHost: APP_HOST,
    });
    expect(result.$referring_domain).toBe("btc-vaults.evil.com");
  });

  it("truncates a referrer hostname to 100 characters", () => {
    const host = `${["a", "b", "c"].map((c) => c.repeat(50)).join(".")}.com`;
    const result = deriveAttribution({
      search: "",
      referrer: `https://${host}/`,
      cookie: "",
      ownHost: APP_HOST,
    });
    expect(result.$referring_domain).toBe(host.slice(0, 100));
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

  it("treats a referrer that is not a URL as no referrer", () => {
    expect(
      deriveAttribution({
        search: "",
        referrer: "not a url",
        cookie: "",
        ownHost: APP_HOST,
      }),
    ).toEqual({ $referring_domain: "$direct", via: "other" });
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

  it("does not count the app's own host as a referrer", () => {
    expect(
      deriveAttribution({
        search: "",
        referrer: `https://${APP_HOST}/vaults`,
        cookie: "",
        ownHost: APP_HOST,
      }),
    ).toEqual({ $referring_domain: "$direct", via: "other" });
  });

  it("does not count another btc-vaults host as a referrer", () => {
    expect(
      deriveAttribution({
        search: "",
        referrer: "https://btc-vaults.babylonlabs.io/",
        cookie: "",
        ownHost: APP_HOST,
      }),
    ).toEqual({ $referring_domain: "$direct", via: "other" });
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

  it("does not count a host that only starts with babylonlabs.io as the website", () => {
    expect(
      deriveAttribution({
        search: "",
        referrer: "https://babylonlabs.io.evil.com/",
        cookie: cookieOf({ utm_source: "x" }),
        ownHost: APP_HOST,
      }),
    ).toEqual({ $referring_domain: "babylonlabs.io.evil.com", via: "other" });
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
