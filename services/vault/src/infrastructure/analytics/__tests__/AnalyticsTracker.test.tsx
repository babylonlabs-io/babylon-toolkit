import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getWalletAddress, setWalletAddress } from "../analyticsSession";
import { AnalyticsTracker } from "../AnalyticsTracker";
import { settleGeofence, trackEvent } from "../trackEvent";
import { markUserConfirmation } from "../walletConnections";

const featureFlagsMock = vi.hoisted(() => ({ isExploreEnabled: true }));

vi.mock("@/config/featureFlags", () => ({ default: featureFlagsMock }));

const geoFencing = vi.hoisted(() => ({
  state: { isGeoBlocked: false, isLoading: false, isGeoChecked: true },
}));

vi.mock("@/context/geofencing", () => ({
  useGeoFencing: () => geoFencing.state,
}));

const ETH_ADDRESS = "0xAbC0000000000000000000000000000000000001";
const OTHER_ETH_ADDRESS = "0xAbC0000000000000000000000000000000000002";

const wallets = vi.hoisted(() => ({
  eth: { address: undefined as string | undefined },
  session: { connected: false },
}));

vi.mock("@/context/wallet", () => ({
  useETHWallet: () => wallets.eth,
}));

vi.mock("@babylonlabs-io/wallet-connector", () => ({
  useWalletConnect: () => wallets.session,
}));

vi.mock("../trackEvent", () => ({
  trackEvent: vi.fn(),
  settleGeofence: vi.fn(),
}));

// A new element each time: React skips re-rendering an identical one.
function tracker() {
  return (
    <MemoryRouter initialEntries={["/"]}>
      <AnalyticsTracker />
    </MemoryRouter>
  );
}

/** Each wallet_connected sent, with the address it carried. */
function connectedEvents() {
  return walletAddressAtSend.filter(
    ({ event }) => event === "wallet_connected",
  );
}

let walletAddressAtSend: {
  event: string;
  properties: unknown;
  walletAddress: string | null;
}[] = [];

beforeEach(() => {
  vi.mocked(trackEvent).mockReset();
  vi.mocked(settleGeofence).mockClear();
  walletAddressAtSend = [];
  vi.mocked(trackEvent).mockImplementation((event, properties) => {
    walletAddressAtSend.push({
      event,
      properties,
      walletAddress: getWalletAddress(),
    });
  });
  featureFlagsMock.isExploreEnabled = true;
  geoFencing.state = {
    isGeoBlocked: false,
    isLoading: false,
    isGeoChecked: true,
  };
  wallets.eth = { address: undefined };
  wallets.session = { connected: false };
  setWalletAddress(null);
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

  it("sends a restored wallet_connected with the address when a saved session is confirmed after load", () => {
    const view = render(tracker());
    expect(connectedEvents()).toEqual([]);

    wallets.eth = { address: ETH_ADDRESS };
    wallets.session = { connected: true };
    view.rerender(tracker());

    expect(connectedEvents()).toEqual([
      {
        event: "wallet_connected",
        properties: { chain: "eth", restored: true },
        walletAddress: "0xabc0000000000000000000000000000000000001",
      },
    ]);
  });

  it("sends a user wallet_connected when the session follows the dialog's confirmation", () => {
    const view = render(tracker());

    markUserConfirmation();
    wallets.eth = { address: ETH_ADDRESS };
    wallets.session = { connected: true };
    view.rerender(tracker());

    expect(connectedEvents().map(({ properties }) => properties)).toEqual([
      { chain: "eth", restored: false },
    ]);
  });

  it("sends nothing and clears the address when the account changes while the session stays confirmed", () => {
    wallets.eth = { address: ETH_ADDRESS };
    wallets.session = { connected: true };
    const view = render(tracker());
    expect(getWalletAddress()).toBe(ETH_ADDRESS.toLowerCase());

    wallets.eth = { address: OTHER_ETH_ADDRESS };
    view.rerender(tracker());

    expect(connectedEvents()).toHaveLength(1);
    expect(getWalletAddress()).toBeNull();
  });

  it("sends wallet_connected for the new account once its session is confirmed after the reset", () => {
    wallets.eth = { address: ETH_ADDRESS };
    wallets.session = { connected: true };
    const view = render(tracker());
    wallets.eth = { address: OTHER_ETH_ADDRESS };
    view.rerender(tracker());

    wallets.session = { connected: false };
    view.rerender(tracker());
    wallets.session = { connected: true };
    view.rerender(tracker());

    expect(connectedEvents().map(({ walletAddress }) => walletAddress)).toEqual(
      [ETH_ADDRESS.toLowerCase(), OTHER_ETH_ADDRESS.toLowerCase()],
    );
    expect(getWalletAddress()).toBe(OTHER_ETH_ADDRESS.toLowerCase());
  });

  it("sends nothing and records no address for an address without a confirmed session", () => {
    // The ETH wallet reports an account the app holds no session for.
    wallets.eth = { address: ETH_ADDRESS };
    const view = render(tracker());
    view.rerender(tracker());

    expect(connectedEvents()).toEqual([]);
    expect(getWalletAddress()).toBeNull();
  });

  it("sends wallet_connected again when a dropped session is confirmed again", () => {
    const view = render(tracker());
    wallets.eth = { address: ETH_ADDRESS };
    wallets.session = { connected: true };
    view.rerender(tracker());
    wallets.session = { connected: false };
    view.rerender(tracker());
    wallets.session = { connected: true };
    view.rerender(tracker());

    expect(connectedEvents()).toHaveLength(2);
  });

  it("clears the recorded address when the session ends but the wallet keeps its address", () => {
    const view = render(tracker());
    wallets.eth = { address: ETH_ADDRESS };
    wallets.session = { connected: true };
    view.rerender(tracker());
    expect(getWalletAddress()).not.toBeNull();

    wallets.session = { connected: false };
    view.rerender(tracker());
    expect(getWalletAddress()).toBeNull();
  });
});
