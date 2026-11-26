import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router";
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

vi.mock("@babylonlabs-io/wallet-connector/btc-eth", () => ({
  useWalletConnect: () => wallets.session,
}));

const consent = vi.hoisted(() => ({
  value: "all" as "all" | "essential" | "denied" | null,
}));

vi.mock("@/hooks/useCookieConsent", () => ({
  useCookieConsent: () => consent.value,
}));

vi.mock("../trackEvent", () => ({
  trackEvent: vi.fn(),
  settleGeofence: vi.fn(),
}));

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
  consent.value = "all";
  geoFencing.state = {
    isGeoBlocked: false,
    isLoading: false,
    isGeoChecked: true,
  };
  wallets.eth = { address: undefined };
  wallets.session = { connected: false };
  setWalletAddress(null);
});

function NavigateButton({ to }: { to: string }) {
  const navigate = useNavigate();
  return <button onClick={() => navigate(to)}>navigate</button>;
}

// A new element each time: React skips re-rendering an identical one.
function trackerAt(path: string) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <AnalyticsTracker />
    </MemoryRouter>
  );
}

describe("AnalyticsTracker", () => {
  it("sends no page view before the visitor accepts all cookies, then one for the current page on Accept all", () => {
    consent.value = null;
    const { rerender } = render(trackerAt("/vaults"));
    consent.value = "essential";
    rerender(trackerAt("/vaults"));
    expect(trackEvent).not.toHaveBeenCalled();

    consent.value = "all";
    rerender(trackerAt("/vaults"));

    expect(vi.mocked(trackEvent).mock.calls).toEqual([
      ["$pageview", { $pathname: "/vaults" }],
    ]);
  });

  it("sends a page view for each route the visitor navigates to", () => {
    render(
      <MemoryRouter initialEntries={["/markets/42"]}>
        <AnalyticsTracker />
        <NavigateButton to="/vaults" />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "navigate" }));

    expect(vi.mocked(trackEvent).mock.calls).toEqual([
      ["$pageview", { $pathname: "/markets/:reserveId" }],
      ["$pageview", { $pathname: "/vaults" }],
    ]);
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
    expect(trackEvent).toHaveBeenCalledExactlyOnceWith("$pageview", {
      $pathname: "/markets/:reserveId",
    });
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
    const view = render(trackerAt("/"));
    expect(connectedEvents()).toEqual([]);

    wallets.eth = { address: ETH_ADDRESS };
    wallets.session = { connected: true };
    view.rerender(trackerAt("/"));

    expect(connectedEvents()).toEqual([
      {
        event: "wallet_connected",
        properties: { chain: "eth", restored: true },
        walletAddress: "0xabc0000000000000000000000000000000000001",
      },
    ]);
  });

  it("sends a user wallet_connected when the session follows the dialog's confirmation", () => {
    const view = render(trackerAt("/"));

    markUserConfirmation();
    wallets.eth = { address: ETH_ADDRESS };
    wallets.session = { connected: true };
    view.rerender(trackerAt("/"));

    expect(connectedEvents().map(({ properties }) => properties)).toEqual([
      { chain: "eth", restored: false },
    ]);
  });

  it("sends nothing and clears the address when the account changes while the session stays confirmed", () => {
    wallets.eth = { address: ETH_ADDRESS };
    wallets.session = { connected: true };
    const view = render(trackerAt("/"));
    expect(getWalletAddress()).toBe(ETH_ADDRESS.toLowerCase());

    wallets.eth = { address: OTHER_ETH_ADDRESS };
    view.rerender(trackerAt("/"));

    expect(connectedEvents()).toHaveLength(1);
    expect(getWalletAddress()).toBeNull();
  });

  it("sends nothing for an account that follows a non-address while the session stays confirmed", () => {
    wallets.eth = { address: ETH_ADDRESS };
    wallets.session = { connected: true };
    const view = render(trackerAt("/"));

    wallets.eth = { address: "0xnot-an-address" };
    view.rerender(trackerAt("/"));
    wallets.eth = { address: OTHER_ETH_ADDRESS };
    view.rerender(trackerAt("/"));

    expect(connectedEvents()).toHaveLength(1);
    expect(getWalletAddress()).toBeNull();
  });

  it("keeps the address when the wallet reports the same account in different casing", () => {
    wallets.eth = { address: ETH_ADDRESS };
    wallets.session = { connected: true };
    const view = render(trackerAt("/"));

    wallets.eth = { address: ETH_ADDRESS.toLowerCase() };
    view.rerender(trackerAt("/"));

    expect(connectedEvents()).toHaveLength(1);
    expect(getWalletAddress()).toBe(ETH_ADDRESS.toLowerCase());
  });

  it("sends wallet_connected for the new account once its session is confirmed after the reset", () => {
    wallets.eth = { address: ETH_ADDRESS };
    wallets.session = { connected: true };
    const view = render(trackerAt("/"));
    wallets.eth = { address: OTHER_ETH_ADDRESS };
    view.rerender(trackerAt("/"));

    wallets.session = { connected: false };
    view.rerender(trackerAt("/"));
    wallets.session = { connected: true };
    view.rerender(trackerAt("/"));

    expect(connectedEvents().map(({ walletAddress }) => walletAddress)).toEqual(
      [ETH_ADDRESS.toLowerCase(), OTHER_ETH_ADDRESS.toLowerCase()],
    );
    expect(getWalletAddress()).toBe(OTHER_ETH_ADDRESS.toLowerCase());
  });

  it("sends nothing and records no address for an address without a confirmed session", () => {
    // The ETH wallet reports an account the app holds no session for.
    wallets.eth = { address: ETH_ADDRESS };
    const view = render(trackerAt("/"));
    view.rerender(trackerAt("/"));

    expect(connectedEvents()).toEqual([]);
    expect(getWalletAddress()).toBeNull();
  });

  it("sends nothing and records no address when the wallet reports a value that is not an address", () => {
    const view = render(trackerAt("/"));
    wallets.eth = { address: "0xnot-an-address" };
    wallets.session = { connected: true };
    view.rerender(trackerAt("/"));

    expect(connectedEvents()).toEqual([]);
    expect(getWalletAddress()).toBeNull();
  });

  it("sends a later restored session as restored after the user's confirmation was used by a non-address", () => {
    const view = render(trackerAt("/"));
    markUserConfirmation();
    wallets.eth = { address: "0xnot-an-address" };
    wallets.session = { connected: true };
    view.rerender(trackerAt("/"));
    wallets.session = { connected: false };
    view.rerender(trackerAt("/"));

    wallets.eth = { address: ETH_ADDRESS };
    wallets.session = { connected: true };
    view.rerender(trackerAt("/"));

    expect(connectedEvents().map(({ properties }) => properties)).toEqual([
      { chain: "eth", restored: true },
    ]);
  });

  it("sends nothing for an address that follows a non-address while the session stays confirmed", () => {
    wallets.eth = { address: "0xnot-an-address" };
    wallets.session = { connected: true };
    const view = render(trackerAt("/"));

    wallets.eth = { address: ETH_ADDRESS };
    view.rerender(trackerAt("/"));

    expect(connectedEvents()).toEqual([]);
    expect(getWalletAddress()).toBeNull();
  });

  it("sends wallet_connected again when a dropped session is confirmed again", () => {
    const view = render(trackerAt("/"));
    wallets.eth = { address: ETH_ADDRESS };
    wallets.session = { connected: true };
    view.rerender(trackerAt("/"));
    wallets.session = { connected: false };
    view.rerender(trackerAt("/"));
    wallets.session = { connected: true };
    view.rerender(trackerAt("/"));

    expect(connectedEvents()).toHaveLength(2);
  });

  it("clears the recorded address when the session ends but the wallet keeps its address", () => {
    const view = render(trackerAt("/"));
    wallets.eth = { address: ETH_ADDRESS };
    wallets.session = { connected: true };
    view.rerender(trackerAt("/"));
    expect(getWalletAddress()).not.toBeNull();

    wallets.session = { connected: false };
    view.rerender(trackerAt("/"));
    expect(getWalletAddress()).toBeNull();
  });
});
