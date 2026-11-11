import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AnalyticsTracker } from "../AnalyticsTracker";
import { settleGeofence, trackEvent } from "../trackEvent";

const featureFlagsMock = vi.hoisted(() => ({ isExploreEnabled: true }));

vi.mock("@/config/featureFlags", () => ({ default: featureFlagsMock }));

const geoFencing = vi.hoisted(() => ({
  state: { isGeoBlocked: false, isLoading: false, isGeoChecked: true },
}));

vi.mock("@/context/geofencing", () => ({
  useGeoFencing: () => geoFencing.state,
}));

vi.mock("../trackEvent", () => ({
  trackEvent: vi.fn(),
  settleGeofence: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(trackEvent).mockClear();
  vi.mocked(settleGeofence).mockClear();
  featureFlagsMock.isExploreEnabled = true;
  geoFencing.state = {
    isGeoBlocked: false,
    isLoading: false,
    isGeoChecked: true,
  };
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

  it("settles the geofence as passed only once the check has run and let the visitor through", () => {
    geoFencing.state = {
      isGeoBlocked: false,
      isLoading: true,
      isGeoChecked: false,
    };
    const view = render(trackerAt("/markets/42"));
    expect(settleGeofence).not.toHaveBeenCalled();

    geoFencing.state = {
      isGeoBlocked: false,
      isLoading: false,
      isGeoChecked: true,
    };
    view.rerender(trackerAt("/markets/42"));

    expect(settleGeofence).toHaveBeenCalledExactlyOnceWith("passed");
  });

  it("settles the geofence as failed for a geo-blocked visitor", () => {
    geoFencing.state = {
      isGeoBlocked: true,
      isLoading: false,
      isGeoChecked: true,
    };
    render(trackerAt("/markets/42"));

    expect(settleGeofence).toHaveBeenCalledExactlyOnceWith("failed");
  });

  it("settles the geofence as failed when a configuration error stopped the check before it ran", () => {
    geoFencing.state = {
      isGeoBlocked: false,
      isLoading: false,
      isGeoChecked: false,
    };
    render(trackerAt("/markets/42"));

    expect(settleGeofence).toHaveBeenCalledExactlyOnceWith("failed");
  });
});
