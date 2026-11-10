import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AnalyticsTracker } from "../AnalyticsTracker";
import { trackEvent } from "../trackEvent";

const featureFlagsMock = vi.hoisted(() => ({ isExploreEnabled: true }));

vi.mock("@/config/featureFlags", () => ({ default: featureFlagsMock }));

const geoFencing = vi.hoisted(() => ({
  state: { isGeoBlocked: false, isLoading: false },
}));

vi.mock("@/context/geofencing", () => ({
  useGeoFencing: () => geoFencing.state,
}));

vi.mock("../trackEvent", () => ({ trackEvent: vi.fn() }));

beforeEach(() => {
  vi.mocked(trackEvent).mockClear();
  featureFlagsMock.isExploreEnabled = true;
  geoFencing.state = { isGeoBlocked: false, isLoading: false };
});

// A new element each time: React skips re-rendering an identical one.
function trackerAt(path: string) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <AnalyticsTracker />
    </MemoryRouter>
  );
}

describe("AnalyticsTracker", () => {
  it("sends a page view with the route template", () => {
    render(
      <MemoryRouter initialEntries={["/markets/42"]}>
        <AnalyticsTracker />
      </MemoryRouter>,
    );
    expect(trackEvent).toHaveBeenCalledWith("$pageview", {
      $pathname: "/markets/:reserveId",
    });
  });

  it("sends no page view for a section the router redirects because its flag is off", () => {
    featureFlagsMock.isExploreEnabled = false;

    render(
      <MemoryRouter initialEntries={["/explore"]}>
        <AnalyticsTracker />
      </MemoryRouter>,
    );

    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("waits for the geofence check and then sends the page view once", () => {
    geoFencing.state = { isGeoBlocked: false, isLoading: true };
    const view = render(trackerAt("/markets/42"));
    expect(trackEvent).not.toHaveBeenCalled();

    geoFencing.state = { isGeoBlocked: false, isLoading: false };
    view.rerender(trackerAt("/markets/42"));

    expect(vi.mocked(trackEvent).mock.calls).toEqual([
      ["$pageview", { $pathname: "/markets/:reserveId" }],
    ]);
  });

  it("sends no page view for a geo-blocked visitor", () => {
    geoFencing.state = { isGeoBlocked: false, isLoading: true };
    const view = render(trackerAt("/markets/42"));

    geoFencing.state = { isGeoBlocked: true, isLoading: false };
    view.rerender(trackerAt("/markets/42"));

    expect(trackEvent).not.toHaveBeenCalled();
  });
});
