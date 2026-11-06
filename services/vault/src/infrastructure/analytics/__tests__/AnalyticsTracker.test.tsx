import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AnalyticsTracker } from "../AnalyticsTracker";
import { trackEvent } from "../trackEvent";

const featureFlagsMock = vi.hoisted(() => ({ isExploreEnabled: true }));

vi.mock("@/config/featureFlags", () => ({ default: featureFlagsMock }));

vi.mock("../trackEvent", () => ({ trackEvent: vi.fn() }));

beforeEach(() => {
  vi.mocked(trackEvent).mockClear();
  featureFlagsMock.isExploreEnabled = true;
});

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
});
