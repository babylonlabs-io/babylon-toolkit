import { beforeEach, describe, expect, it, vi } from "vitest";

import { routeTemplate } from "../routeTemplate";

const featureFlagsMock = vi.hoisted(() => ({ isExploreEnabled: true }));

vi.mock("@/config/featureFlags", () => ({ default: featureFlagsMock }));

beforeEach(() => {
  featureFlagsMock.isExploreEnabled = true;
});

describe("routeTemplate", () => {
  it("reports an enabled flagged section as itself", () => {
    expect(routeTemplate("/explore")).toBe("/explore");
  });

  it("reports nothing for a section the router redirects because its flag is off", () => {
    featureFlagsMock.isExploreEnabled = false;

    expect(routeTemplate("/explore")).toBeNull();
    expect(routeTemplate("/explore/anything")).toBeNull();
  });

  it("reports a static route as itself", () => {
    expect(routeTemplate("/")).toBe("/");
    expect(routeTemplate("/vaults")).toBe("/vaults");
  });

  it("reports a reserve page by its template, not its reserve id", () => {
    expect(routeTemplate("/markets/12")).toBe("/markets/:reserveId");
  });

  it("reports /markets without a reserve as /other, since it renders NotFound", () => {
    expect(routeTemplate("/markets")).toBe("/other");
  });

  it("reports any path outside the app's routes as /other", () => {
    expect(routeTemplate("/0x742d35cc6634c0532925a3b844bc9e7595f2bd80")).toBe(
      "/other",
    );
  });
});
