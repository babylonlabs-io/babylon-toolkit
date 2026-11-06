import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getWalletAddress, setWalletAddress } from "../analyticsSession";
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

const ETH_ADDRESS = "0xAbC0000000000000000000000000000000000001";
const OTHER_ETH_ADDRESS = "0xAbC0000000000000000000000000000000000002";
const BTC_ADDRESS = "tb1qexampleaddress0000000000000000000000";

const wallets = vi.hoisted(() => ({
  eth: { address: undefined as string | undefined },
  btc: { connected: false, address: "" },
  session: { connected: false },
  dialog: { visible: false },
}));

vi.mock("@/context/wallet", () => ({
  useETHWallet: () => wallets.eth,
  useBTCWallet: () => wallets.btc,
}));

vi.mock("@babylonlabs-io/wallet-connector", () => ({
  useWalletConnect: () => wallets.session,
  useWidgetState: () => wallets.dialog,
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

function connectedEvents() {
  return vi
    .mocked(trackEvent)
    .mock.calls.filter(([event]) => event === "wallet_connected");
}

beforeEach(() => {
  vi.mocked(trackEvent).mockClear();
  vi.mocked(settleGeofence).mockClear();
  featureFlagsMock.isExploreEnabled = true;
  geoFencing.state = {
    isGeoBlocked: false,
    isLoading: false,
    isGeoChecked: true,
  };
  wallets.eth = { address: undefined };
  wallets.btc = { connected: false, address: "" };
  wallets.session = { connected: false };
  wallets.dialog = { visible: false };
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

  it("sends wallet_connected for each chain the user connects through the dialog", () => {
    const view = render(tracker());

    wallets.dialog = { visible: true };
    view.rerender(tracker());
    wallets.btc = { connected: true, address: BTC_ADDRESS };
    view.rerender(tracker());
    wallets.eth = { address: ETH_ADDRESS };
    wallets.session = { connected: true };
    wallets.dialog = { visible: false };
    view.rerender(tracker());

    expect(connectedEvents()).toEqual([
      ["wallet_connected", { chain: "btc" }],
      ["wallet_connected", { chain: "eth" }],
    ]);
  });

  it("counts Ethereum when the session is confirmed, not when an address appears", () => {
    // The ETH wallet still reports an address the app holds no session for.
    wallets.eth = { address: ETH_ADDRESS };
    const view = render(tracker());

    wallets.dialog = { visible: true };
    view.rerender(tracker());
    expect(connectedEvents()).toEqual([]);

    wallets.session = { connected: true };
    view.rerender(tracker());
    expect(connectedEvents()).toEqual([["wallet_connected", { chain: "eth" }]]);
  });

  it("sends nothing for a session restored on page load", () => {
    wallets.eth = { address: ETH_ADDRESS };
    wallets.btc = { connected: true, address: BTC_ADDRESS };
    wallets.session = { connected: true };
    const view = render(tracker());
    view.rerender(tracker());

    expect(connectedEvents()).toEqual([]);
    expect(getWalletAddress()).toBe(
      "0xabc0000000000000000000000000000000000001",
    );
  });

  it("counts a new account the user reconnects with after an account switch", () => {
    wallets.eth = { address: ETH_ADDRESS };
    wallets.session = { connected: true };
    const view = render(tracker());

    // The switch drops the session; the user reconnects through the dialog.
    wallets.eth = { address: undefined };
    wallets.session = { connected: false };
    view.rerender(tracker());
    wallets.dialog = { visible: true };
    view.rerender(tracker());
    wallets.eth = { address: OTHER_ETH_ADDRESS };
    wallets.session = { connected: true };
    view.rerender(tracker());

    expect(connectedEvents()).toEqual([["wallet_connected", { chain: "eth" }]]);
  });

  it("counts each wallet once per page load", () => {
    const view = render(tracker());
    wallets.dialog = { visible: true };
    view.rerender(tracker());

    wallets.eth = { address: ETH_ADDRESS };
    wallets.session = { connected: true };
    view.rerender(tracker());
    wallets.session = { connected: false };
    view.rerender(tracker());
    wallets.eth = { address: ETH_ADDRESS.toLowerCase() };
    wallets.session = { connected: true };
    view.rerender(tracker());

    expect(connectedEvents()).toEqual([["wallet_connected", { chain: "eth" }]]);
  });

  it("clears the recorded address when the ETH wallet disconnects", () => {
    wallets.eth = { address: ETH_ADDRESS };
    wallets.session = { connected: true };
    const view = render(tracker());
    expect(getWalletAddress()).not.toBeNull();

    wallets.eth = { address: undefined };
    wallets.session = { connected: false };
    view.rerender(tracker());
    expect(getWalletAddress()).toBeNull();
  });

  it("records no address the wallet reports without a confirmed session", () => {
    wallets.eth = { address: ETH_ADDRESS };
    render(tracker());
    expect(getWalletAddress()).toBeNull();
  });

  it("clears the recorded address when the session ends but the wallet keeps its address", () => {
    wallets.eth = { address: ETH_ADDRESS };
    wallets.session = { connected: true };
    const view = render(tracker());

    wallets.session = { connected: false };
    view.rerender(tracker());
    expect(getWalletAddress()).toBeNull();
  });
});
