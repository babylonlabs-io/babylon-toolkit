import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AnalyticsConfig } from "@/config/env";

import { ANALYTICS_EVENT } from "../analyticsEvents";
import {
  getSessionId,
  getVisitId,
  setWalletAddress,
} from "../analyticsSession";
import { captureAttribution } from "../attribution";
import {
  reportAnalyticsConfigError,
  settleGeofence,
  trackEvent,
} from "../trackEvent";

const { mockWarn, mockError } = vi.hoisted(() => ({
  mockWarn: vi.fn(),
  mockError: vi.fn(),
}));
vi.mock("../../logger", () => ({
  default: { warn: mockWarn, error: mockError },
}));

const CONFIG: AnalyticsConfig = {
  enabled: true,
  host: "https://us.i.posthog.com",
  projectKey: "phc_test",
  network: "devnet",
};

const fetchMock = vi.fn();

function sentBody() {
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return JSON.parse(init.body as string);
}

/**
 * A fresh module, so its once-per-page-load state starts over: reports
 * unreported, and the geofence not yet settled.
 */
async function freshModule() {
  vi.resetModules();
  return import("../trackEvent");
}

/** A fresh module whose geofence has passed. */
async function freshTrackEvent() {
  const module = await freshModule();
  module.settleGeofence("passed");
  return module.trackEvent;
}

// The shared module's geofence passes once, for every test that sends.
settleGeofence("passed");

beforeEach(() => {
  mockWarn.mockClear();
  mockError.mockClear();
  fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  setWalletAddress(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "globalPrivacyControl");
});

describe("trackEvent", () => {
  it("sends nothing when analytics is off", () => {
    trackEvent(
      ANALYTICS_EVENT.PAGEVIEW,
      { $pathname: "/" },
      { enabled: false },
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends nothing when the browser signals Global Privacy Control", () => {
    Object.defineProperty(navigator, "globalPrivacyControl", {
      value: true,
      configurable: true,
    });
    trackEvent(ANALYTICS_EVENT.PAGEVIEW, { $pathname: "/" }, CONFIG);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts one anonymous event to the PostHog batch endpoint without credentials or a referrer", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-02T03:04:05.000Z"));
    trackEvent(ANALYTICS_EVENT.PAGEVIEW, { $pathname: "/vaults" }, CONFIG);
    vi.useRealTimers();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://us.i.posthog.com/batch/");
    expect(init).toMatchObject({
      method: "POST",
      keepalive: true,
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    const body = sentBody();
    expect(body.api_key).toBe("phc_test");
    expect(body.batch).toHaveLength(1);
    expect(body.batch[0]).toMatchObject({
      event: "$pageview",
      distinct_id: getVisitId(),
      timestamp: "2026-01-02T03:04:05.000Z",
      properties: {
        $pathname: "/vaults",
        network: "devnet",
        $session_id: getSessionId(),
        $process_person_profile: false,
      },
    });
    expect(body.batch[0].properties.wallet_address).toBeUndefined();
  });

  it("attaches the connected wallet address, lowercased", () => {
    setWalletAddress("0x742d35Cc6634C0532925a3b844Bc9e7595f2bD80");
    trackEvent(
      ANALYTICS_EVENT.WALLET_CONNECTED,
      { chain: "eth", restored: false },
      CONFIG,
    );
    expect(sentBody().batch[0].properties.wallet_address).toBe(
      "0x742d35cc6634c0532925a3b844bc9e7595f2bd80",
    );
  });

  it("adds a 0x prefix to a vault id without one, lowercased", () => {
    trackEvent(
      ANALYTICS_EVENT.DEPOSIT_BROADCAST,
      { vault_id: "ABCDEF01" },
      CONFIG,
    );
    expect(sentBody().batch[0].properties.vault_id).toBe("0xabcdef01");
  });

  it("lowercases a vault id with a lowercase 0x prefix without adding another", () => {
    trackEvent(
      ANALYTICS_EVENT.DEPOSIT_BROADCAST,
      { vault_id: "0xABcdEF01" },
      CONFIG,
    );
    expect(sentBody().batch[0].properties.vault_id).toBe("0xabcdef01");
  });

  it("sends a vault id with an uppercase 0X prefix as lowercase 0x hex", () => {
    trackEvent(
      ANALYTICS_EVENT.DEPOSIT_BROADCAST,
      { vault_id: "0XABCDEF01" },
      CONFIG,
    );
    expect(sentBody().batch[0].properties.vault_id).toBe("0xabcdef01");
  });

  it("sends only the allow-listed fields, with and without a wallet address", () => {
    window.history.pushState({}, "", "/?utm_source=x");
    captureAttribution();
    window.history.pushState({}, "", "/");
    trackEvent(
      ANALYTICS_EVENT.WALLET_CONNECTED,
      { chain: "btc", restored: false },
      CONFIG,
    );
    setWalletAddress("0x742d35Cc6634C0532925a3b844Bc9e7595f2bD80");
    trackEvent(
      ANALYTICS_EVENT.WALLET_CONNECTED,
      { chain: "eth", restored: false },
      CONFIG,
    );

    const bodies = fetchMock.mock.calls.map(([, init]) =>
      JSON.parse((init as RequestInit).body as string),
    );
    const baseKeys = [
      "$process_person_profile",
      "$referring_domain",
      "$session_id",
      "chain",
      "network",
      "restored",
      "utm_source",
      "via",
    ];
    for (const body of bodies) {
      expect(Object.keys(body).sort()).toEqual(["api_key", "batch"]);
      expect(Object.keys(body.batch[0]).sort()).toEqual([
        "distinct_id",
        "event",
        "properties",
        "timestamp",
      ]);
    }
    expect(Object.keys(bodies[0].batch[0].properties).sort()).toEqual(baseKeys);
    expect(Object.keys(bodies[1].batch[0].properties).sort()).toEqual([
      ...baseKeys,
      "wallet_address",
    ]);
  });

  it("reports a rejected key as an error once per page load", async () => {
    const send = await freshTrackEvent();
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    send(ANALYTICS_EVENT.PAGEVIEW, { $pathname: "/" }, CONFIG);
    send(ANALYTICS_EVENT.PAGEVIEW, { $pathname: "/" }, CONFIG);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    // Let both responses settle before counting the reports.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockError).toHaveBeenCalledTimes(1);
    expect(mockError).toHaveBeenCalledWith(
      new Error("Analytics capture rejected: HTTP 401"),
      { tags: { category: "analytics", event: "$pageview" } },
    );
  });

  it("reports a malformed request (HTTP 400) as an error", async () => {
    const send = await freshTrackEvent();
    fetchMock.mockResolvedValue(new Response(null, { status: 400 }));
    send(ANALYTICS_EVENT.PAGEVIEW, { $pathname: "/" }, CONFIG);
    await vi.waitFor(() =>
      expect(mockError).toHaveBeenCalledWith(
        new Error("Analytics capture rejected: HTTP 400"),
        { tags: { category: "analytics", event: "$pageview" } },
      ),
    );
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it("reports a forbidden key (HTTP 403) as an error", async () => {
    const send = await freshTrackEvent();
    fetchMock.mockResolvedValue(new Response(null, { status: 403 }));
    send(ANALYTICS_EVENT.PAGEVIEW, { $pathname: "/" }, CONFIG);
    await vi.waitFor(() =>
      expect(mockError).toHaveBeenCalledWith(
        new Error("Analytics capture rejected: HTTP 403"),
        { tags: { category: "analytics", event: "$pageview" } },
      ),
    );
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it("reports a host that is not a capture API (HTTP 404) as an error", async () => {
    const send = await freshTrackEvent();
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }));
    send(ANALYTICS_EVENT.PAGEVIEW, { $pathname: "/" }, CONFIG);
    await vi.waitFor(() =>
      expect(mockError).toHaveBeenCalledWith(
        new Error("Analytics capture rejected: HTTP 404"),
        { tags: { category: "analytics", event: "$pageview" } },
      ),
    );
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it("logs PostHog rate limiting (HTTP 429) as a warning, not an error", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 429 }));
    trackEvent(ANALYTICS_EVENT.PAGEVIEW, { $pathname: "/" }, CONFIG);
    await vi.waitFor(() =>
      expect(mockWarn).toHaveBeenCalledWith(
        "Analytics capture failed: HTTP 429",
        { category: "analytics", event: "$pageview" },
      ),
    );
    expect(mockError).not.toHaveBeenCalled();
  });

  it("logs a PostHog outage (HTTP 503) as a warning, not an error", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 503 }));
    trackEvent(ANALYTICS_EVENT.PAGEVIEW, { $pathname: "/" }, CONFIG);
    await vi.waitFor(() =>
      expect(mockWarn).toHaveBeenCalledWith(
        "Analytics capture failed: HTTP 503",
        { category: "analytics", event: "$pageview" },
      ),
    );
    expect(mockError).not.toHaveBeenCalled();
  });

  it("logs nothing when PostHog accepts the event", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    trackEvent(ANALYTICS_EVENT.PAGEVIEW, { $pathname: "/" }, CONFIG);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    // Let the response settle before checking that nothing was logged.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockWarn).not.toHaveBeenCalled();
    expect(mockError).not.toHaveBeenCalled();
  });

  it("reports an event that cannot be built as an error once per page load", async () => {
    const send = await freshTrackEvent();
    const broken = {
      get $pathname(): string {
        throw new Error("boom");
      },
    };
    expect(() => send(ANALYTICS_EVENT.PAGEVIEW, broken, CONFIG)).not.toThrow();
    send(ANALYTICS_EVENT.PAGEVIEW, broken, CONFIG);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockError).toHaveBeenCalledTimes(1);
    expect(mockError).toHaveBeenCalledWith(
      new Error("Analytics event could not be sent: boom"),
      { tags: { category: "analytics", event: "$pageview" } },
    );
  });

  it("logs a network failure instead of throwing", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    expect(() =>
      trackEvent(ANALYTICS_EVENT.PAGEVIEW, { $pathname: "/" }, CONFIG),
    ).not.toThrow();
    await vi.waitFor(() =>
      expect(mockWarn).toHaveBeenCalledWith(
        "Analytics capture failed: Failed to fetch",
        { category: "analytics", event: "$pageview" },
      ),
    );
  });

  it("attaches the attribution captured at startup", () => {
    window.history.pushState({}, "", "/?utm_source=x&utm_campaign=launch");
    captureAttribution();
    window.history.pushState({}, "", "/");
    trackEvent(ANALYTICS_EVENT.PAGEVIEW, { $pathname: "/" }, CONFIG);
    expect(sentBody().batch[0].properties).toMatchObject({
      utm_source: "x",
      utm_campaign: "launch",
      via: "other",
    });
  });
});

describe("reportAnalyticsConfigError", () => {
  it("reports a configuration error as an error", () => {
    reportAnalyticsConfigError("Product analytics is off: bad host");
    expect(mockError).toHaveBeenCalledWith(
      new Error("Product analytics is off: bad host"),
      { tags: { category: "analytics" } },
    );
  });

  it("reports nothing when the configuration is valid", () => {
    reportAnalyticsConfigError(null);
    expect(mockError).not.toHaveBeenCalled();
  });
});

describe("geofence gate", () => {
  it("holds events until the geofence passes, then sends them in order", async () => {
    const { trackEvent: send, settleGeofence: settle } = await freshModule();
    send(ANALYTICS_EVENT.PAGEVIEW, { $pathname: "/" }, CONFIG);
    send(ANALYTICS_EVENT.PAGEVIEW, { $pathname: "/vaults" }, CONFIG);
    expect(fetchMock).not.toHaveBeenCalled();

    settle("passed");

    const paths = fetchMock.mock.calls.map(
      ([, init]) =>
        JSON.parse((init as RequestInit).body as string).batch[0].properties
          .$pathname,
    );
    expect(paths).toEqual(["/", "/vaults"]);
  });

  it("sends a held event with the time it was tracked, without keepalive", async () => {
    const { trackEvent: send, settleGeofence: settle } = await freshModule();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-02T03:04:05.000Z"));
    send(ANALYTICS_EVENT.PAGEVIEW, { $pathname: "/" }, CONFIG);
    vi.setSystemTime(new Date("2026-01-02T03:04:09.000Z"));

    settle("passed");
    vi.useRealTimers();

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.keepalive).toBe(false);
    expect(sentBody().batch[0].timestamp).toBe("2026-01-02T03:04:05.000Z");
  });

  it("sends a held event with the wallet address it was tracked with", async () => {
    const module = await freshModule();
    const session = await import("../analyticsSession");
    session.setWalletAddress("0x1111111111111111111111111111111111111111");
    module.trackEvent(ANALYTICS_EVENT.PAGEVIEW, { $pathname: "/" }, CONFIG);
    session.setWalletAddress("0x2222222222222222222222222222222222222222");

    module.settleGeofence("passed");

    expect(sentBody().batch[0].properties.wallet_address).toBe(
      "0x1111111111111111111111111111111111111111",
    );
  });

  it("drops held events and sends nothing later when the geofence fails", async () => {
    const { trackEvent: send, settleGeofence: settle } = await freshModule();
    send(ANALYTICS_EVENT.PAGEVIEW, { $pathname: "/" }, CONFIG);

    settle("failed");
    send(ANALYTICS_EVENT.PAGEVIEW, { $pathname: "/vaults" }, CONFIG);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("holds nothing after the geofence fails, so no hold-limit warning follows", async () => {
    const { trackEvent: send, settleGeofence: settle } = await freshModule();
    settle("failed");

    for (let i = 0; i < 51; i += 1) {
      send(ANALYTICS_EVENT.PAGEVIEW, { $pathname: "/" }, CONFIG);
    }

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it("keeps the first outcome of the page load", async () => {
    const { trackEvent: send, settleGeofence: settle } = await freshModule();
    settle("failed");
    settle("passed");

    send(ANALYTICS_EVENT.PAGEVIEW, { $pathname: "/" }, CONFIG);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps sending held events when one send throws, and reports it once", async () => {
    const { trackEvent: send, settleGeofence: settle } = await freshModule();
    send(ANALYTICS_EVENT.PAGEVIEW, { $pathname: "/" }, CONFIG);
    send(ANALYTICS_EVENT.PAGEVIEW, { $pathname: "/vaults" }, CONFIG);
    fetchMock.mockImplementationOnce(() => {
      throw new TypeError("Request refused");
    });

    expect(() => settle("passed")).not.toThrow();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(init.body as string).batch[0].properties.$pathname).toBe(
      "/vaults",
    );
    expect(mockError).toHaveBeenCalledTimes(1);
    expect(mockError).toHaveBeenCalledWith(
      new Error("Analytics event could not be sent: Request refused"),
      { tags: { category: "analytics", event: "$pageview" } },
    );
  });

  it("holds at most 50 events and warns once about the rest", async () => {
    const { trackEvent: send, settleGeofence: settle } = await freshModule();
    for (let i = 0; i < 52; i += 1) {
      send(ANALYTICS_EVENT.PAGEVIEW, { $pathname: "/" }, CONFIG);
    }

    settle("passed");

    expect(fetchMock).toHaveBeenCalledTimes(50);
    expect(mockWarn).toHaveBeenCalledTimes(1);
  });
});
