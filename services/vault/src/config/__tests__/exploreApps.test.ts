import { afterEach, describe, expect, it, vi } from "vitest";

import { getExploreApps, resolveExploreAppUrl } from "../exploreApps";

const getBTCNetworkMock = vi.hoisted(() => vi.fn());

vi.mock("@/config/network", () => ({
  getBTCNetwork: getBTCNetworkMock,
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("resolveExploreAppUrl", () => {
  it("returns a plain string destination unchanged without reading the network", () => {
    const url = resolveExploreAppUrl("https://example.com/app");

    expect(url).toBe("https://example.com/app");
    expect(getBTCNetworkMock).not.toHaveBeenCalled();
  });

  it("resolves a per-network map to the active network's destination", () => {
    getBTCNetworkMock.mockReturnValue("signet");

    const url = resolveExploreAppUrl({
      mainnet: "https://example.com/main",
      signet: "https://example.com/test",
    });

    expect(url).toBe("https://example.com/test");
  });

  it("throws when the active network has no configured destination", () => {
    getBTCNetworkMock.mockReturnValue("signet");

    expect(() =>
      resolveExploreAppUrl({ mainnet: "https://example.com/main" }),
    ).toThrow(/signet/);
  });
});

describe("getExploreApps", () => {
  it("returns every registry entry with its destination resolved to a string", () => {
    getBTCNetworkMock.mockReturnValue("signet");

    const apps = getExploreApps();

    expect(apps.map((a) => a.id)).toEqual(["aave", "cradle", "aegis", "b14g"]);
    for (const app of apps) {
      expect(typeof app.appUrl).toBe("string");
      expect(app.appUrl.length).toBeGreaterThan(0);
    }
  });
});
